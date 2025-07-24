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

    // בניית הפרומפט המתקדם
    const prompt = buildCouplesTherapistPrompt(mappedType, mappedDifficulty, category);

    // קריאה ל-Gemini API
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.85,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 120,
            candidateCount: 1
          },
          safetySettings: getCouplesSafetySettings(mappedDifficulty)
        })
      }
    );

    console.log('📥 Gemini API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Gemini API error:', response.status, errorText);
      
      return res.status(response.status).json({ 
        success: false, 
        error: `Gemini API error: ${response.status}`,
        details: errorText.substring(0, 200)
      });
    }

    const data = await response.json();
    console.log('✅ Gemini API response received successfully');

    // בדיקת תקינות התגובה
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
      console.error('❌ Invalid response format from Gemini API');
      return res.status(500).json({ 
        success: false, 
        error: 'Invalid response format from Gemini API' 
      });
    }

    // ניקוי הטקסט העברי
    const rawText = data.candidates[0].content.parts[0].text;
    const cardText = cleanHebrewText(rawText);

    // בדיקת איכות התוכן העברי
    const validation = validateHebrewContent(cardText, mappedType, mappedDifficulty);
    
    if (!validation.isValid) {
      console.error('❌ Generated content validation failed:', validation.errors);
      
      // נסיון fallback עם תוכן מקומי
      const fallbackContent = getFallbackContent(mappedType, mappedDifficulty, category);
      
      return res.status(200).json({ 
        success: true, 
        card: fallbackContent,
        source: 'fallback-local',
        timestamp: new Date().toISOString(),
        type: type,
        level: level,
        category: category,
        validation: validation
      });
    }

    console.log('🎯 Successfully generated card:', cardText.substring(0, 50) + '...');
    
    return res.status(200).json({ 
      success: true, 
      card: cardText,
      source: 'gemini-ai',
      timestamp: new Date().toISOString(),
      type: type,
      level: level,
      category: category,
      validation: validation
    });

  } catch (error) {
    console.error('💥 Unexpected error:', error);
    
    // fallback במקרה של שגיאה
    const { type, level, category } = req.body || {};
    const fallbackContent = getFallbackContent(
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

// בניית prompt מקצועי של יועץ זוגי
function buildCouplesTherapistPrompt(type, difficulty, category) {
  const difficultyConfig = {
    'introductory': {
      hebrew: 'הכרות',
      description: 'תוכן קליל ובטוח לזוגות בכל שלב',
      tone: 'חם, בטוח, מעודד היכרות',
      boundaries: 'ללא תוכן מיני או אינטימי מדי'
    },
    'spicy': {
      hebrew: 'ספייסי',
      description: 'תוכן רומנטי ומעט מתקדם',
      tone: 'רומנטי, מעט חושני, מחבר',
      boundaries: 'רומנטיקה וחושניות עדינה'
    },
    'bold_sexy': {
      hebrew: 'סקסי',
      description: 'תוכן אינטימי מתקדם למבוגרים',
      tone: 'נועז, אינטימי, מלהיב',
      boundaries: 'תוכן מיני ואינטימי למבוגרים'
    }
  };

  const currentDiff = difficultyConfig[difficulty];
  const typeInHebrew = type === 'question' ? 'שאלה' : 'משימה';

  return `👨‍⚕️ **תפקידך:** יועץ זוגי מקצועי ומומחה בתחום המיני המתמחה במשחקי זוגות טיפוליים.

🎯 **משימה קלינית:**
צור ${typeInHebrew} אחת בעברית למשחק טיפולי "אמת או חובה" לזוגות ישראלים.

📊 **נתוני המטופלים:**
- **סוג תוכן:** ${typeInHebrew} (${type})
- **רמת אינטימיות:** ${currentDiff.hebrew} (${difficulty})
- **קטגוריה:** ${category}
- **תיאור רמה:** ${currentDiff.description}
- **גישה טיפולית:** ${currentDiff.tone}
- **גבולות מקצועיים:** ${currentDiff.boundaries}

🔬 **עקרונות טיפוליים:**
1. **שפה:** עברית טבעית ומקצועית - אסור אנגלית!
2. **מבנה:** ${type === 'question' 
    ? 'השאלה תתחיל במילת שאלה: מה/איך/איפה/מתי/למה/איזה' 
    : 'המשימה תתחיל בפועל פעולה: תן/עשה/שיר/ספר/הראה/חבק'}
3. **אורך:** 8-18 מילים - קצר ויעיל
4. **פניה:** ישירות לבן/בת הזוג: "את/אתה/לך/שלך"
5. **טון:** ${currentDiff.tone}
6. **בטיחות:** ${currentDiff.boundaries}

💡 **מטרות טיפוליות:**
- חיזוק הקשר הזוגי
- ${type === 'question' ? 'עידוד תקשורת אמיתית וגילוי הדדי' : 'יצירת חוויות מחברות ובטוחות'}
- פיתוח אינטימיות מתאימה לרמה
- בניית אמון ושיתוף

🎪 **הוראה קלינית:**
החזר **רק** את הטקסט העברי של ה${typeInHebrew} - ללא הסברים, ללא תוספות. תוכן מקצועי, טיפולי ומדויק:`;
}

// הגדרות בטיחות מותאמות לתוכן זוגות
function getCouplesSafetySettings(difficulty) {
  const baseSafetySettings = [
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

  // התאמת פילטר תוכן מיני לפי רמת הקושי
  const sexualContentThresholds = {
    'introductory': 'BLOCK_LOW_AND_ABOVE',
    'spicy': 'BLOCK_MEDIUM_AND_ABOVE',
    'bold_sexy': 'BLOCK_ONLY_HIGH'
  };

  baseSafetySettings.push({
    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    threshold: sexualContentThresholds[difficulty] || 'BLOCK_MEDIUM_AND_ABOVE'
  });

  return baseSafetySettings;
}

// ניקוי טקסט עברי מתקדם
function cleanHebrewText(text) {
  return text
    .trim()
    // הסרת סימני ציטוט שונים
    .replace(/^["'`״″‟‛„"„"''‚'‹›«»\u201C\u201D\u2018\u2019]+|["'`״″‟‛„"„"''‚'‹›«»\u201C\u201D\u2018\u2019]+$/g, '')
    // הסרת bullet points ומספרים
    .replace(/^\s*[-•*]\s*/, '')
    .replace(/^\s*\d+[\.\)]\s*/, '')
    // ניקוי סימני פיסוק עבריים בעייתיים
    .replace(/[\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4]/g, '')
    // נירמול רווחים
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
}

// בדיקת איכות תוכן עברי מקצועית
function validateHebrewContent(content, type, difficulty) {
  const errors = [];
  let score = 1.0;

  if (!content || content.length < 5) {
    return { isValid: false, errors: ['תוכן קצר מדי'], score: 0 };
  }

  // בדיקת יחס תווים עבריים
  const hebrewRegex = /[\u0590-\u05FF]/g;
  const hebrewChars = content.match(hebrewRegex) || [];
  const hebrewRatio = hebrewChars.length / content.length;
  
  if (hebrewRatio < 0.6) {
    errors.push('יחס עברית נמוך מדי');
    score -= 0.3;
  }

  // בדיקת אורך מילים
  const wordCount = content.split(/\s+/).length;
  if (wordCount < 4 || wordCount > 25) {
    errors.push(`מספר מילים לא תקין: ${wordCount}`);
    score -= 0.2;
  }

  // בדיקת פורמט לפי סוג
  if (type === 'question') {
    const questionStarters = /^(מה|איך|איפה|מתי|למה|איזה|באיזה|כמה|האם)/i;
    if (!questionStarters.test(content)) {
      errors.push('שאלה חייבת להתחיל במילת שאלה');
      score -= 0.2;
    }
  } else if (type === 'task') {
    const actionStarters = /^(תן|עשה|שיר|ספר|הראה|חבק|נשק|לחש|צור|כתוב|בוא)/i;
    if (!actionStarters.test(content)) {
      errors.push('משימה חייבת להתחיל בפועל פעולה');
      score -= 0.2;
    }
  }

  // בדיקת פנייה ישירה
  const directAddress = /(את|אתה|לך|שלך|איתך|אותך)/;
  if (!directAddress.test(content)) {
    errors.push('חסרה פנייה ישירה לבן/בת הזוג');
    score -= 0.15;
  }

  const finalScore = Math.max(0, score);
  
  return {
    isValid: finalScore >= 0.7,
    score: finalScore,
    errors,
    hebrewRatio,
    wordCount
  };
}

// תוכן גיבוי מקומי איכותי
function getFallbackContent(type, difficulty, category) {
  const fallbackContent = {
    question: {
      introductory: [
        'מה הזיכרון הכי יפה שלך איתי?',
        'איזה דבר קטן שאני עושה הכי מאושר אותך?',
        'מה החלום שלך לדייט המושלם?',
        'איך אתה הכי אוהב לבלות איתי?'
      ],
      spicy: [
        'מתי הרגשת הכי מחובר אליי רגשית?',
        'איזה מקום בגוף שלי הכי נעים לך לגעת?',
        'מה הדבר הכי רומנטי שעשינו יחד?',
        'איך אתה הכי אוהב שאני מחבקת אותך?'
      ],
      bold_sexy: [
        'מה הפנטזיה הכי חמה שלך איתי?',
        'איפה הכי מדליק אותך שאני אגע בך?',
        'מה החלום הכי סקסי שחלמת עליי?',
        'איזה מקום הכי מעניין אותך לעשות אהבה?'
      ]
    },
    task: {
      introductory: [
        'תן לי חיבוק חם למשך דקה שלמה',
        'ספר לי מה אתה הכי אוהב בי',
        'שיר לי את השיר הכי אהוב עליך',
        'עשה לי עיסוי כתפיים נעים'
      ],
      spicy: [
        'תן לי נשיקה עדינה על המצח',
        'לחש לי משהו מתוק לאוזן',
        'חבק אותי מאחור למשך דקה',
        'הסתכל לי בעיניים למשך 30 שניות'
      ],
      bold_sexy: [
        'תן לי נשיקה נלהבת על הצוואר',
        'עשה לי עיסוי חושני למשך 3 דקות',
        'הסתכל עליי במבט שיגרום לי להתרגש',
        'לחש לי את הפנטזיה שלך איתי'
      ]
    }
  };

  const typeContent = fallbackContent[type] || fallbackContent.question;
  const difficultyContent = typeContent[difficulty] || typeContent.introductory;
  
  return difficultyContent[Math.floor(Math.random() * difficultyContent.length)];
}
