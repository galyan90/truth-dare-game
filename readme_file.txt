# 💕 משחק שאלה או משימה - זוגות

משחק אינטראקטיבי לזוגות עם תוכן שנוצר על ידי Claude AI בזמן אמת.

## ✨ תכונות

- 🤖 **Claude AI Integration** - תוכן חדש ומקורי בכל משחק
- 💎 **גיבוי מקומי** - מאות שאלות ומשימות איכותיות
- 📱 **רספונסיבי** - עובד מעולה במובייל ובמחשב
- 🎨 **עיצוב מודרני** - ממשק משתמש יפה ואינטואיטיבי
- 🔥 **3 רמות אינטימיות** - מקלילה ועד נועזת

## 🚀 פריסה ל-Vercel

### דרישות מוקדמות
- חשבון GitHub (חינם)
- חשבון Vercel (חינם)
- Claude API Key מ-Anthropic

### הוראות פריסה

1. **צור Repository ב-GitHub:**
   - לך ל-GitHub.com
   - צור repository חדש בשם `truth-dare-game`
   - העלה את כל הקבצים מהתיקיה

2. **חבר ל-Vercel:**
   - לך ל-Vercel.com
   - התחבר עם GitHub
   - לחץ "New Project"
   - בחר את הrepository שיצרת
   - לחץ "Deploy"

3. **הגדר Claude API Key:**
   - בVercel Dashboard → Project Settings
   - לחץ "Environment Variables"
   - הוסף משתנה:
     - Name: `CLAUDE_API_KEY`
     - Value: המפתח שלך מ-Anthropic
   - לחץ "Save"

4. **פרוס מחדש:**
   - חזור ל"Deployments"
   - לחץ "Redeploy" עם "Use existing Build Cache" כבוי

## 📁 מבנה הפרויקט

```
truth-dare-game/
├── index.html          # המשחק הראשי
├── api/
│   └── claude.js       # API endpoint לClaude
├── package.json        # הגדרות Node.js
├── vercel.json         # הגדרות Vercel
└── README.md           # התיעוד
```

## 🔧 פיתוח מקומי

אם אתה רוצה לפתח מקומית:

```bash
# התקן Vercel CLI
npm install -g vercel

# הרץ שרת פיתוח
vercel dev
```

## 🎮 איך לשחק

1. בחר קטגוריה (קלילה/רומנטית/נועזת)
2. כל שחקן בתורו בוחר "שאלה" או "משימה"
3. עבור על האתגר או דלג ושתה!
4. המשחק מתחלף בין השחקנים

## 🛠️ טכנולוגיות

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Vercel Serverless Functions
- **AI**: Claude 3.5 Sonnet API
- **Hosting**: Vercel (חינם)

## 📝 רישיון

MIT License - ניתן לשימוש חופשי ולשינוי.

## 🆘 תמיכה

אם יש בעיות:
1. בדוק את הלוגים בVercel Dashboard
2. ודא שה-API Key מוגדר נכון
3. בדוק את Developer Console בדפדפן

---

**נבנה עם ❤️ לזוגות שרוצים להכיר אחד את השני טוב יותר**