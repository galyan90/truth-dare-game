export default async function handler(req, res) {
  console.log('🔥 Gemini API called:', req.method, new Date().toISOString());
  
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

    // תרגום רמות קושי מהמסך לפרמטרים
    const difficultyMapping = {
      'הכרות': 'introductory',
      'ספייסי': 'spicy', 
      'סקסי': 'bold_sexy'
    };

    // תרגום סוג תוכן
    const typeMapping = {
      'truth': 'question',
      'dare': 'task',
      'שאלה': 'question',
      'משימה': 'task'
    };

    const mappedDifficulty = difficultyMapping[level] || level;
    const mappedType = typeMapping[type] || type;

    console.log('🔄 Mapped parameters:', { 
      originalType: type, 
      mappedType, 
      originalLevel: level, 
      mappedDifficulty 
    });

    // בדיקת API key
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY not found in environment');
      return res.status(500).json({ 
        success: false, 
        error: 'Gemini API key not configured on server' 
      });
    }

    console.log('🤖 Sending request to Gemini API...');

    // ניסיון ראשון עם פרומפט משופר
    let cardText = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (!cardText && attempts < maxAttempts) {
      attempts++;
      console.log(`🎯 Attempt ${attempts}/${maxAttempts}`);

      try {
        const prompt = buildImprovedPrompt(mappedType, mappedDifficulty, category, attempts);
        
        const response = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': process.env.GEMINI_API_KEY
            }
      } catch (error) {
        console.error(`💥 Error in attempt ${attempts}:`, error.message);
        
        // מיד עוצר את הלולאה עבור rate limit - לא מנסה שוב
        if (response.status === 429) {
          console.log('🚫 Rate limit - stopping attempts');
          break;
        }
      },
            body: JSON.stringify({
              contents: [{
                parts: [{ text: prompt }]
              }],
              generationConfig: {
                temperature: attempts === 1 ? 0.7 : 0.9, // יותר יצירתיות בניסיונות נוספים
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 100,
                candidateCount: 1
              },
              safetySettings: getImprovedSafetySettings(mappedDifficulty)
            })
          }
        );

        console.log(`📥 Gemini API response status (attempt ${attempts}):`, response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Gemini API error (attempt ${attempts}):`, response.status, errorText);
          continue; // ניסיון הבא
        }

        const data = await response.json();
        
        if (data.candidates && data.candidates[0] && data.candidates[0].content && 
            data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
          
          const rawText = data.candidates[0].content.parts[0].text;
          const cleanText = cleanHebrewText(rawText);
          const validation = validateImprovedContent(cleanText, mappedType, mappedDifficulty);
          
          if (validation.isValid) {
            cardText = cleanText;
            console.log(`✅ High quality card generated on attempt ${attempts}:`, cardText.substring(0, 50) + '...');
            
            return res.status(200).json({ 
              success: true, 
              card: cardText,
              source: 'gemini-ai',
              timestamp: new Date().toISOString(),
              type: type,
              level: level,
              category: category,
              validation: validation,
              attempts: attempts
            });
          } else {
            console.log(`⚠️ Generated content failed validation (attempt ${attempts}):`, validation.errors);
          }
        }
              // מיד עוצר את הלולאה עבור rate limit - לא מנסה שוב
        if (response.status === 429) {
          console.log('🚫 Rate limit - stopping attempts');
          break;
        }
    }

    // אם כל הניסיונות נכשלו - fallback לתוכן מקומי
    console.log('🔄 All attempts failed, using fallback content');
    const fallbackContent = getImprovedFallbackContent(mappedType, mappedDifficulty, category);
    
    return res.status(200).json({ 
      success: true, 
      card: fallbackContent,
      source: 'fallback-improved',
      timestamp: new Date().toISOString(),
      type: type,
      level: level,
      category: category,
      attempts: attempts
    });

  } catch (error) {
    console.error('💥 Unexpected error:', error);
    
    const { type, level, category } = req.body || {};
    const fallbackContent = getImprovedFallbackContent(
      type === 'truth' ? 'question' : 'task', 
      level === 'הכרות' ? 'introductory' : level === 'ספייסי' ? 'spicy' : 'bold_sexy',
      category || 'general'
    );
    
    return res.status(200).json({ 
      success: true, 
      card: fallbackContent,
      source: 'fallback-error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// פרומפט משופר ללא דוגמאות גרועות
function buildImprovedPrompt(type, difficulty, category, attempt) {

  const typeInHebrew = type === 'question' ? 'שאלה' : 'משימה';
  const difficultyInHebrew = {
    'introductory': 'הכרות קלילה',
    'spicy': 'רומנטי וחושני', 
    'bold_sexy': 'נועז והרפתקני'
  }[difficulty];

  return `אתה מומחה ביצירת תוכן לזוגות ישראלים.

🎯 צור ${typeInHebrew} אחת חדשה ומקורית בעברית למשחק "אמת או חובה" לזוגות.

📋 פרטי המשימה:
- סוג: ${typeInHebrew}
- רמה: ${difficultyInHebrew}
- קטגוריה: ${category}

✅ כללים חשובים:
1. תוכן בעברית בלבד - אסור אנגלית!
2. ${type === 'question' ? 'השאלה חייבת להתחיל במילת שאלה (מה/איך/איפה/מתי/למה/איזה)' : 'המשימה חייבת להתחיל בפועל פעולה (תן/עשה/ספר/שיר/הראה)'}
3. אורך: 8-15 מילים בדיוק
4. פנייה ישירה לבן/בת הזוג באמצעות "אתה/את/לך/שלך"
5. תוכן מתאים, מכבד וחיובי

  return `אתה מומחה ביצירת תוכן לזוגות ישראלים.

🎯 צור ${typeInHebrew} אחת חדשה ומקורית בעברית למשחק "אמת או חובה" לזוגות.

📋 פרטי המשימה:
- סוג: ${typeInHebrew}
- רמה: ${difficultyInHebrew}
- קטגוריה: ${category}

✅ כללים חשובים:
1. תוכן בעברית בלבד - אסור אנגלית!
2. ${type === 'question' ? 'השאלה חייבת להתחיל במילת שאלה (מה/איך/איפה/מתי/למה/איזה)' : 'המשימה חייבת להתחיל בפועל פעולה (תן/עשה/ספר/שיר/הראה)'}
3. אורך: 8-15 מילים בדיוק
4. פנייה ישירה לבן/בת הזוג באמצעות "אתה/את/לך/שלך"
5. תוכן מתאים, מכבד וחיובי
6. היה יצירתי ומקורי - אל תשתמש בביטויים שחוקים

💡 הוראה: כתוב רק את הטקסט של ה${typeInHebrew} - ללא הסברים או תוספות.
${attempt > 1 ? '\n🔄 זה ניסיון ' + attempt + ' - היה יותר יצירתי ומקורי!' : ''}

ה${typeInHebrew} שלך:`;
}

// הגדרות בטיחות משופרות
function getImprovedSafetySettings(difficulty) {
  const settings = [
    {
      category: "HARM_CATEGORY_HARASSMENT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE"
    },
    {
      category: "HARM_CATEGORY_HATE_SPEECH", 
      threshold: "BLOCK_MEDIUM_AND_ABOVE"
    },
    {
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE"
    }
  ];

  // התאמת רמת תוכן מיני
  const sexualThresholds = {
    'introductory': 'BLOCK_LOW_AND_ABOVE',
    'spicy': 'BLOCK_MEDIUM_AND_ABOVE',
    'bold_sexy': 'BLOCK_ONLY_HIGH'
  };

  settings.push({
    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    threshold: sexualThresholds[difficulty] || 'BLOCK_MEDIUM_AND_ABOVE'
  });

  return settings;
}

// ניקוי טקסט משופר
function cleanHebrewText(text) {
  return text
    .trim()
    // הסרת סימני ציטוט ופיסוק מיותרים
    .replace(/^["'`״″‟‛„"„"''‚'‹›«»\u201C\u201D\u2018\u2019\-\*•\.]+|["'`״″‟‛„"„"''‚'‹›«»\u201C\u201D\u2018\u2019\-\*•\.]+$/g, '')
    // הסרת מספרים וnumbers
    .replace(/^\s*\d+[\.\)]\s*/, '')
    .replace(/^\s*[-•*]\s*/, '')
    // הסרת מילים באנגלית
    .replace(/[a-zA-Z]+/g, '')
    // ניקוי רווחים מיותרים
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
}

// בדיקת איכות משופרת
function validateImprovedContent(content, type, difficulty) {
  const errors = [];
  let score = 1.0;

  if (!content || content.length < 8) {
    return { isValid: false, errors: ['תוכן קצר מדי או ריק'], score: 0 };
  }

  // בדיקת עברית
  const hebrewRegex = /[\u0590-\u05FF]/g;
  const hebrewChars = content.match(hebrewRegex) || [];
  const totalChars = content.replace(/\s+/g, '').length;
  const hebrewRatio = totalChars > 0 ? hebrewChars.length / totalChars : 0;
  
  if (hebrewRatio < 0.8) {
    errors.push('יחס עברית נמוך מדי');
    score -= 0.4;
  }

  // בדיקת אורך מילים
  const words = content.split(/\s+/).filter(word => word.length > 0);
  if (words.length < 6 || words.length > 18) {
    errors.push(`מספר מילים לא מתאים: ${words.length}`);
    score -= 0.3;
  }

  // בדיקת פורמט לפי סוג
  if (type === 'question') {
    const questionStarters = /^(מה|איך|איפה|מתי|למה|איזה|באיזה|כמה|האם|מי|מתי)/i;
    if (!questionStarters.test(content)) {
      errors.push('שאלה חייבת להתחיל במילת שאלה');
      score -= 0.4;
    }
    if (!content.includes('?') && !content.endsWith('?')) {
      content += '?'; // תוספת אוטומטית של סימן שאלה
    }
  } else if (type === 'task') {
    const actionStarters = /^(תן|עשה|שיר|ספר|הראה|חבק|נשק|לחש|צור|כתוב|בוא|עזור|שחק)/i;
    if (!actionStarters.test(content)) {
      errors.push('משימה חייבת להתחיל בפועל פעולה');
      score -= 0.4;
    }
  }

  // בדיקת פנייה ישירה
  const directAddress = /(את|אתה|לך|שלך|איתך|אותך)/;
  if (!directAddress.test(content)) {
    errors.push('חסרה פנייה ישירה לבן/בת הזוג');
    score -= 0.2;
  }

  // בדיקת תווים זרים
  const englishLetters = content.match(/[a-zA-Z]/g);
  if (englishLetters && englishLetters.length > 2) {
    errors.push('יותר מדי אותיות באנגלית');
    score -= 0.3;
  }

  const finalScore = Math.max(0, score);
  
  return {
    isValid: finalScore >= 0.7,
    score: finalScore,
    errors,
    hebrewRatio,
    wordCount: words.length,
    cleanedContent: content
  };
}

// תוכן גיבוי משופר ומגוון
function getImprovedFallbackContent(type, difficulty, category) {
  const improvedContent = {
    question: {
      introductory: [
        'מה הזיכרון הכי יפה שלך מהשנה הזאת?',
        'איזה דבר קטן שאני עושה הכי מאושר אותך?',
        'איפה הכי בא לך לנסוע יחד איתי?',
        'מה החלום שלך לדייט המושלם שלנו?',
        'איזה תחביב חדש היית רוצה שננסה יחד?',
        'מה הדבר הכי מצחיק שקרה לך השבוע?',
        'איזה אוכל הכי בא לך שאכין לך?',
        'מה השיר שהכי מזכיר לך אותי?'
      ],
      spicy: [
        'מה הרגע הכי רומנטי שחווינו יחד עד היום?',
        'איך אתה הכי אוהב שאני מחבקת אותך?',
        'מה הדבר הכי מושך בי לדעתך?',
        'מתי הרגשת הכי מחובר אליי רגשית?',
        'איזה מקום בגוף שלי הכי נעים לך?',
        'מה הפנטזיה הרומנטית שלך איתي?',
        'איך נראה הערב הרומנטי המושלם בעיניך?',
        'מה הדבר הכי חושני שאני עושה בלי לשים לב?'
      ],
      bold_sexy: [
        'מה הפנטזיה הכי חמה שלך איתי?',
        'איפה הכי מדליק אותך שאני אגע בך?',
        'מה החלום הכי סקסי שחלמת עליי?',
        'איזה מקום הכי מעניין אותך לעשות אהבה?',
        'מה הדבר הכי סקסי שאני עושה?',
        'איזו תנוחה הכי מעניינת אותך לנסות?',
        'מה הדבר הכי נועז שרצית לבקש ממני?',
        'איזה חלום מיני היה לך עליי השבוע?'
      ]
    },
    task: {
      introductory: [
        'תן לי חיבוק חם ונעים למשך דקה שלמה',
        'ספר לי שלושה דברים שאתה הכי אוהב בי',
        'עשה לי עיסוי כתפיים רגוע למשך דקותיים',
        'שיר לי את השיר הכי אהוב עליך',
        'ספר לי על החלום הכי יפה שחלמת עליי',
        'תן לי שלוש מחמאות כנות מהלב',
        'עשה לי משהו שיגרום לי לצחוק',
        'כתוב לי פתק אהבה קצר ומתוק'
      ],
      spicy: [
        'תן לי נשיקה עדינה ורכה על המצח',
        'חבק אותי מאחור בעדינות למשך דקה',
        'לחש לי משהו רומנטי ומתוק לאוזן',
        'הסתכל לי בעיניים למשך חצי דקה',
        'תן לי עיסוי ידיים עדין למשך דקה',
        'נשק לי את כף היד כמו נסיך',
        'ספר לי בפירוט למה אתה אוהב אותי',
        'חבק אותי חיבוק איטי וחם למשך דקה'
      ],
      bold_sexy: [
        'תן לי נשיקה נלהבת על הצוואר',
        'הסתכל עליי במבט שיגרום לי להתרגש',
        'עשה לי עיסוי כתפיים חושני למשך דקה',
        'לחש לי את הפנטזיה שלך איתי',
        'תן לי מגע עדין על הזרוע למשך דקה',
        'נשק אותי נשיקה של 10 שניות',
        'ספר לי מה הכי מעורר אותך בי',
        'תן לי ליטוף עדין על הלחי'
      ]
    }
  };

  const typeContent = improvedContent[type] || improvedContent.question;
  const difficultyContent = typeContent[difficulty] || typeContent.introductory;
  
  return difficultyContent[Math.floor(Math.random() * difficultyContent.length)];
}
