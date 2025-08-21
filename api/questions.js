// A Next.js API route for generating Truth or Dare content via Gemini API.
// This implementation includes:
// - Proper CORS handling with configurable allowed origins.
// - Input validation and mapping from Hebrew UI values to API parameters.
// - Prompt construction in Hebrew with clear instructions.
// - Attempts with backoff and safety settings.
// - Deduplication logic to prevent returning previously generated questions/tasks.
// - Fallback content in case the API fails or the content does not pass validation.
//
// To use this file in a Next.js project, place it under /pages/api and set the environment
// variable GEMINI_API_KEY with your Gemini API key.

const fs = require('fs');

// Path on disk to store previously generated cards to avoid duplicates.
const GENERATED_FILE_PATH = '/tmp/generated_truth_or_dare.json';

// Load previously generated cards from disk into a Set.
function loadGeneratedSet() {
  try {
    const data = fs.readFileSync(GENERATED_FILE_PATH, 'utf-8');
    const arr = JSON.parse(data);
    return new Set(arr);
  } catch (err) {
    return new Set();
  }
}

// Save the current Set of generated cards to disk.
function saveGeneratedSet(set) {
  try {
    const arr = Array.from(set);
    fs.writeFileSync(GENERATED_FILE_PATH, JSON.stringify(arr));
  } catch (err) {
    console.warn('⚠️ Failed to save generated set:', err.message);
  }
}

// Sleep helper for exponential backoff between attempts.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Safely extract text content from a fetch Response.
async function safeText(res) {
  try {
    return await res.text();
  } catch (err) {
    return err.message || 'unknown response text error';
  }
}

// Build the Hebrew prompt for Gemini based on type, difficulty, category and attempt number.
function buildPrompt(type, difficulty, category, attempt) {
  const typeInHebrew = type === 'question' ? 'שאלה' : 'משימה';
  const difficultyInHebrew = {
    introductory: 'הכרות קלילה',
    spicy: 'רומנטי וחושני',
    bold_sexy: 'נועז והרפתקני'
  }[difficulty] || difficulty;

  // The prompt instructs the model to create a single card respecting strict rules.
  // Each attempt after the first encourages additional creativity.
  return (
    `אתה מומחה ביצירת תוכן לזוגות ישראלים.\n\n` +
    `🎯 צור ${typeInHebrew} אחת חדשה ומקורית בעברית למשחק "אמת או חובה" לזוגות.\n\n` +
    `📋 פרטי המשימה:\n` +
    `- סוג: ${typeInHebrew}\n` +
    `- רמה: ${difficultyInHebrew}\n` +
    `- קטגוריה: ${category}\n\n` +
    `✅ כללים חשובים:\n` +
    `1. התוכן חייב להיות בעברית בלבד – אסור להשתמש באנגלית.\n` +
    `2. ${
      type === 'question'
        ? 'השאלה חייבת להתחיל במילת שאלה (מה/איך/איפה/מתי/למה/איזה).'
        : 'המשימה חייבת להתחיל בפועל פעולה (תן/עשה/ספר/שיר/הראה).'
    }\n` +
    `3. אורך: בדיוק בין 8 ל‑15 מילים.\n` +
    `4. פנייה ישירה לבן/בת הזוג באמצעות "אתה/את/לך/שלך".\n` +
    `5. תוכן מתאים, מכבד וחיובי בלבד.\n` +
    `6. היה יצירתי ומקורי – אל תשתמש בביטויים שחוקים.\n\n` +
    `💡 הוראה: כתוב רק את הטקסט של ה${typeInHebrew} – ללא הסברים או תוספות.\n` +
    (attempt > 1
      ? `🔄 זה ניסיון מספר ${attempt} – היה עוד יותר יצירתי ומקורי!\n`
      : '') +
    `\nה${typeInHebrew} שלך:`
  );
}

// Define safety settings for the Gemini API to control the types of content returned.
function getSafetySettings(difficulty) {
  // For more daring levels allow some mild sexual content; for introductory block it.
  const sexualThreshold =
    difficulty === 'bold_sexy' || difficulty === 'spicy'
      ? 'BLOCK_LOW_AND_ABOVE'
      : 'BLOCK_MEDIUM_AND_ABOVE';
  return [
    {
      category: 'HARM_CATEGORY_SEXUAL',
      threshold: sexualThreshold
    },
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE'
    },
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE'
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE'
    }
  ];
}

// Clean up the raw text returned from Gemini: remove unwanted characters and extra spaces.
function cleanHebrewText(text) {
  if (!text) return '';
  // Remove characters that are not letters, numbers, spaces or basic punctuation.
  let cleaned = text
    .replace(/[^\u0590-\u05FF0-9\s!?.,-]/g, '') // keep Hebrew letters, numbers, spaces, basic punctuation
    .replace(/\s+/g, ' ')
    .trim();
  // Remove trailing punctuation like colon at end.
  cleaned = cleaned.replace(/^[:\s]+|[:\s]+$/g, '');
  return cleaned;
}

// Validate the generated content according to our rules and check for duplicates.
function validateContent(text, type, difficulty, generatedSet) {
  const errors = [];
  const words = text.trim().split(/\s+/);

  // Check word count (8 to 15 words)
  if (words.length < 8 || words.length > 15) {
    errors.push('הטקסט חייב להיות באורך של 8-15 מילים.');
  }

  // Only Hebrew characters allowed (letters between U+0590 and U+05FF) and spaces/punctuation.
  if (/[^\u0590-\u05FF0-9\s!?.,-]/.test(text)) {
    errors.push('התוכן חייב להיות בעברית בלבד – ללא אנגלית או סימנים זרים.');
  }

  // Must start with appropriate word.
  const firstWord = words[0] || '';
  if (type === 'question') {
    const questionWords = ['מה', 'איך', 'איפה', 'מתי', 'למה', 'איזה'];
    if (!questionWords.includes(firstWord)) {
      errors.push('שאלה חייבת להתחיל במילת שאלה: מה, איך, איפה, מתי, למה או איזה.');
    }
  } else {
    const verbs = ['תן', 'עשה', 'ספר', 'שיר', 'הראה'];
    if (!verbs.includes(firstWord)) {
      errors.push('משימה חייבת להתחיל בפועל פעולה: תן, עשה, ספר, שיר או הראה.');
    }
  }

  // Must contain direct address words (אתה/את/לך/שלך)
  const addressWords = ['אתה', 'את', 'לך', 'שלך'];
  if (!addressWords.some((w) => text.includes(w))) {
    errors.push('הטקסט חייב לכלול פנייה ישירה לבן/בת הזוג: אתה/את/לך/שלך.');
  }

  // Unique check
  if (generatedSet.has(text)) {
    errors.push('התוכן הזה כבר נוצר בעבר. אנא נסה שוב לקבל תוצאה חדשה.');
  }

  return { isValid: errors.length === 0, errors };
}

// Fallback lists of questions and tasks in Hebrew, organized by difficulty.
const fallbackData = {
  question: {
    introductory: [
      'מה הדבר הכי מרגש שעשית יחד עם בן הזוג שלך?',
      'איך אתה מרגיש לגבי הפגישה הראשונה שלכם עד היום?',
      'איזה זיכרון משותף גורם לך לחייך כל פעם מחדש?'
    ],
    spicy: [
      'איך היית מתאר את הנשיקה הכי טובה שקיבלת מבן הזוג שלך?',
      'למה אתה מתגעגע ברגעים הרומנטיים הזכורים לכם ביותר?',
      'איזו מחווה רומנטית הכי היית רוצה לקבל מבן הזוג?'
    ],
    bold_sexy: [
      'איזה משחק רומנטי היית רוצה לשחק במיטה עם בן הזוג שלך?',
      'איזה פנטזיה נועזת היית רוצה לממש עם בן הזוג שלך?',
      'מה המקום הכי מפתיע שהיית רוצה לנסות בו משהו אינטימי?'
    ]
  },
  task: {
    introductory: [
      'תן לבן הזוג חיבוק גדול ואמור לו משהו מתוק ויפה.',
      'עשה מחמאה אמיתית לבן הזוג על משהו שאתה אוהב בו.',
      'ספר לבן הזוג סוד קטן עליך שעדיין הוא לא יודע.'
    ],
    spicy: [
      'עשה עיסוי עדין לגב של בן הזוג במשך חמש דקות מלאות.',
      'שיר בקול רך שיר אהבה לבן הזוג בזמן חיבוק עדין.',
      'הראה לבן הזוג את המבט הכי רומנטי שלך ותחזיק אותו עשר שניות.'
    ],
    bold_sexy: [
      'תן נשיקה איטית וחושנית לצוואר של בן הזוג למשך חמש שניות.',
      'ספר סיפור קצר על הפנטזיה הכי נועזת שלכם ביחד.',
      'עשה ריקוד קצר ואיטי מול בן הזוג באווירה אינטימית.'
    ]
  }
};

// Select a fallback content based on type, difficulty and previously generated items.
function getFallbackContent(type, difficulty, generatedSet) {
  const options =
    fallbackData[type] && fallbackData[type][difficulty]
      ? fallbackData[type][difficulty]
      : [];
  // Filter out already generated options
  const fresh = options.filter((opt) => !generatedSet.has(opt));
  if (fresh.length === 0) {
    // If all options used, just return the first option
    return options[0] || 'תודה שהשתתפתם במשחק!';
  }
  // Pick a random fresh option
  const idx = Math.floor(Math.random() * fresh.length);
  return fresh[idx];
}

// Main handler function for the API route.
module.exports = async function handler(req, res) {
  console.log('🔥 Gemini API called:', req.method, new Date().toISOString());

  // ---- CORS configuration ----
  // Allow requests from any origin like the original implementation.
  res.setHeader('Access-Control-Allow-Origin', '*');
  // We do not vary on origin because we accept any origin.
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-cache');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    console.log('✅ OPTIONS request handled');
    return res.status(200).end();
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    console.log('❌ Method not allowed:', req.method);
    return res.status(405).json({
      success: false,
      error: 'Only POST method allowed',
      method: req.method
    });
  }

  try {
    // ---- Parse and validate request body ----
    const { type, level, category } = req.body || {};
    console.log('📝 Request data:', { type, level, category });

    if (!type || !level || !category) {
      console.log('❌ Missing required fields');
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: type, level, category',
        received: { type, level, category }
      });
    }

    // Map level and type from Hebrew UI or English to API values
    const difficultyMapping = {
      'הכרות': 'introductory',
      'ספייסי': 'spicy',
      'סקסי': 'bold_sexy',
      introductory: 'introductory',
      spicy: 'spicy',
      bold_sexy: 'bold_sexy'
    };
    const typeMapping = {
      truth: 'question',
      dare: 'task',
      'שאלה': 'question',
      'משימה': 'task',
      question: 'question',
      task: 'task'
    };

    const mappedDifficulty = difficultyMapping[level] || level;
    const mappedType = typeMapping[type] || type;
    const cleanedCategory = String(category || 'general').trim().slice(0, 40);

    console.log('🔄 Mapped parameters:', {
      originalType: type,
      mappedType,
      originalLevel: level,
      mappedDifficulty,
      category: cleanedCategory
    });

    // Check API key
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY not found in environment');
      return res.status(500).json({
        success: false,
        error: 'Gemini API key not configured on server'
      });
    }

    // Load existing generated cards set for deduplication
    const generatedSet = loadGeneratedSet();

    let cardText = null;
    let attempts = 0;
    const maxAttempts = 3;
    let lastRawText = '';
    let lastCleanedText = '';
    let lastValidation = null;

    while (!cardText && attempts < maxAttempts) {
      attempts++;
      console.log(`🎯 Attempt ${attempts}/${maxAttempts}`);

      const prompt = buildPrompt(mappedType, mappedDifficulty, cleanedCategory, attempts);

      try {
        const response = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': process.env.GEMINI_API_KEY
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: attempts === 1 ? 0.7 : 0.9,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 100,
                candidateCount: 1
              },
              safetySettings: getSafetySettings(mappedDifficulty)
            })
          }
        );

        console.log(`📥 Gemini API response status (attempt ${attempts}):`, response.status);

        if (response.status === 429) {
          console.warn('🚫 Rate limit – stopping attempts');
          break;
        }

        if (!response.ok) {
          const errorText = await safeText(response);
          console.error(
            `❌ Gemini API error (attempt ${attempts}):`,
            response.status,
            errorText
          );
          // backoff before next attempt
          await sleep(250 * attempts);
          continue;
        }

        const data = await response.json();

        // Extract raw text and clean it
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log('🔍 DEBUG – Raw text from Gemini:', rawText);
        lastRawText = rawText;

        const cleanedText = cleanHebrewText(rawText);
        console.log('🔍 DEBUG – Cleaned text:', cleanedText);
        lastCleanedText = cleanedText;

        const validation = validateContent(cleanedText, mappedType, mappedDifficulty, generatedSet);
        console.log('🔍 DEBUG – Validation result:', validation);
        lastValidation = validation;

        if (validation.isValid) {
          cardText = cleanedText;
          // Add to generated set and save for deduplication
          generatedSet.add(cardText);
          saveGeneratedSet(generatedSet);
          console.log(`✅ Valid card generated on attempt ${attempts}:`, cardText);
          return res.status(200).json({
            success: true,
            card: cardText,
            source: 'gemini-ai',
            timestamp: new Date().toISOString(),
            type,
            level,
            category,
            validation: validation,
            attempts,
            debug: {
              rawText: lastRawText,
              cleanedText: lastCleanedText,
              validationErrors: validation.errors
            }
          });
        } else {
          console.log(
            `⚠️ Generated content failed validation (attempt ${attempts}):`,
            validation.errors
          );
          // Backoff then try again
          await sleep(200 * attempts);
        }
      } catch (err) {
        console.error(`💥 Error during attempt ${attempts}:`, err);
        // If error occurs, wait a bit before next attempt
        await sleep(300 * attempts);
      }
    }

    // If all attempts failed, use fallback content
    console.log('🔄 All attempts failed – using fallback content');
    const fallbackContent = getFallbackContent(mappedType, mappedDifficulty, generatedSet);
    generatedSet.add(fallbackContent);
    saveGeneratedSet(generatedSet);

    return res.status(200).json({
      success: true,
      card: fallbackContent,
      source: 'fallback-improved',
      timestamp: new Date().toISOString(),
      type,
      level,
      category,
      attempts
    });
  } catch (err) {
    console.error('💥 Unexpected error:', err);
    // Provide fallback with mapping to ensure type/difficulty mapping exists
    const mappedDifficultyFallback =
      level === 'הכרות' ? 'introductory' : level === 'ספייסי' ? 'spicy' : 'bold_sexy';
    const mappedTypeFallback = type === 'truth' ? 'question' : 'task';
    const generatedSet = loadGeneratedSet();
    const fallbackContent = getFallbackContent(mappedTypeFallback, mappedDifficultyFallback, generatedSet);
    generatedSet.add(fallbackContent);
    saveGeneratedSet(generatedSet);
    return res.status(200).json({
      success: true,
      card: fallbackContent,
      source: 'fallback-error',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
};
