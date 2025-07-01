export default async function handler(req, res) {
  console.log('🔥 Claude API called:', req.method, new Date().toISOString());
  
  // הגדרת CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-cache');

  // טיפול ב-preflight request
  if (req.method === 'OPTIONS') {
    console.log('✅ OPTIONS request handled');
    return res.status(200).end();
  }

  // רק POST מותר
  if (req.method !== 'POST') {
    console.log('❌ Method not allowed:', req.method);
    return res.status(405).json({ 
      success: false, 
      error: 'Only POST method allowed',
      method: req.method
    });
  }

  try {
    const { type, level, category } = req.body;
    console.log('📝 Request data:', { type, level, category });

    // בדיקת נתונים נדרשים
    if (!type || !level || !category) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: type, level, category',
        received: { type, level, category }
      });
    }

    // בדיקת API key
    if (!process.env.CLAUDE_API_KEY) {
      console.error('❌ CLAUDE_API_KEY not found in environment');
      return res.status(500).json({ 
        success: false, 
        error: 'Claude API key not configured on server' 
      });
    }

    console.log('🤖 Sending request to Claude API...');

    // בניית הפרומפט
    const prompt = `צור ${type === 'truth' ? 'שאלה' : 'משימה'} חדשה למשחק "שאלה או משימה" לזוגות.

רמת האינטימיות: ${level} (${category})
סוג: ${type === 'truth' ? 'שאלה' : 'משימה'}

הנחיות חשובות:
- כתוב בעברית בלבד, בשפה טבעית וזורמת
- ${type === 'truth' ? 'השאלה צריכה להיות מעניינת, מסקרנת ומתאימה לרמה' : 'המשימה צריכה להיות ברת ביצוע, נעימה ומתאימה לרמה'}
- התוכן מיועד לזוגות בלבד (18+)
- אורך: 10-25 מילים בלבד
- ${type === 'truth' ? 'השאלה תתחיל במילת שאלה (מה/איך/איפה/מתי/למה)' : 'המשימה תתחיל בפועל (תן/עשה/שיר/ספר/הראה)'}

החזר רק את הטקסט של ${type === 'truth' ? 'השאלה' : 'המשימה'} - ללא הסברים נוספים.`;

    // קריאה ל-Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 150,
        temperature: 0.9,
        messages: [{
          role: 'user',
          content: prompt
        }]
      }),
    });

    console.log('📥 Claude API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Claude API error:', response.status, errorText);
      
      return res.status(response.status).json({ 
        success: false, 
        error: `Claude API error: ${response.status}`,
        details: errorText.substring(0, 200) // מגביל את הודעת השגיאה
      });
    }

    const data = await response.json();
    console.log('✅ Claude API response received successfully');

    // בדיקת תקינות התגובה
    if (!data.content || !data.content[0] || !data.content[0].text) {
      console.error('❌ Invalid response format from Claude API');
      return res.status(500).json({ 
        success: false, 
        error: 'Invalid response format from Claude API' 
      });
    }

    // ניקוי הטקסט
    const cardText = data.content[0].text
      .trim()
      .replace(/^["']|["']$/g, '') // הסרת גרשיים מההתחלה והסוף
      .replace(/^\s*[-•]\s*/, '') // הסרת רמזורים
      .trim();

    if (!cardText || cardText.length < 5) {
      console.error('❌ Generated text too short or empty:', cardText);
      return res.status(500).json({ 
        success: false, 
        error: 'Generated text is too short or empty' 
      });
    }

    console.log('🎯 Successfully generated card:', cardText.substring(0, 50) + '...');
    
    return res.status(200).json({ 
      success: true, 
      card: cardText,
      source: 'claude-ai',
      timestamp: new Date().toISOString(),
      type: type,
      level: level,
      category: category
    });

  } catch (error) {
    console.error('💥 Unexpected error:', error);
    
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}