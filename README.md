# Question Generator — bilingual IT MCQ web app

A web version of the original Tkinter desktop tool. Enter a topic (or a
reference question / code snippet), pick a question type, and it generates
one bilingual (English + Sinhala) multiple-choice question with Gemini and
downloads it as a formatted `.docx` — styled with the same Word templates
and the same legacy Sinhala font encoding (`4u-Chami.`) as the original app.

**Nothing is stored server-side.** Each request builds the document in memory
and streams it straight back as the HTTP response; no database, no file
storage, no logs of generated questions.

## Project structure

```
├── index.html            The page (topic box, model field, question-type picker, button)
├── static/
│   ├── style.css
│   └── script.js          Calls the API and triggers the .docx download
├── api/
│   ├── generate.py         Vercel Python function — POST /api/generate
│   └── UnicodeToLegacy.py  Unchanged Unicode → legacy Sinhala font converter
├── templates/
│   ├── QuestionNormal.docx
│   ├── QuestionStatement.docx
│   └── QuestionCode.docx
├── prompt.txt              The system prompt sent to Gemini
├── requirements.txt
└── vercel.json
```

## 1. Get a Gemini API key

Create one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
if you don't already have one.

> ⚠️ **About the key that was in your original project's `apikey.txt`:**
> that file wasn't included in this rebuild on purpose — committing a real
> key into a repo (especially one you might deploy publicly) means anyone
> with the repo can spend your Gemini quota. Since that key was in the
> project you shared, it's worth treating it as exposed and generating a
> fresh one in AI Studio, then revoking the old one.

## 2. Deploy to Vercel

**Option A — Vercel dashboard**
1. Push this folder to a GitHub/GitLab/Bitbucket repo.
2. [Import the repo in Vercel](https://vercel.com/new).
3. Before the first deploy (or right after, then redeploy), go to
   **Project → Settings → Environment Variables** and add:
   - `GEMINI_API_KEY` = your key
4. Deploy.

**Option B — Vercel CLI**
```bash
npm install -g vercel
vercel
vercel env add GEMINI_API_KEY
vercel --prod
```

No build step is needed — the page is static and `api/generate.py` is
deployed automatically as a Python serverless function.

## 3. Local development

```bash
python3 -m venv .venv
source .venv/bin/activate        # .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env             # then fill in GEMINI_API_KEY

npm install -g vercel            # if you don't have it already
vercel dev
```

`vercel dev` serves `index.html` and runs `api/generate.py` together, so the
`fetch("/api/generate")` call in `static/script.js` works exactly as it will
in production.

## Notes on the UI

Every control from the Tkinter version is here:
- **Question topic** — the multiline text box.
- **Gemini model** — text field, defaults to `gemini-3.6-flash` like the
  original. Any model string your API key has access to works.
- **Question type** — Normal / Statement / Code, same three options.
- **Generate** — button that kicks off generation and downloads the `.docx`.

## If generation is timing out

`vercel.json` sets `maxDuration: 60` for `api/generate.py`. Gemini calls for
a full bilingual question with 5 explained options usually finish well
within that, but if you're on a plan/model combination where it doesn't,
raise `maxDuration` there (check your current Vercel plan's function-duration
limit first, since it caps what you're allowed to set).

## Customizing the question format

- Edit `prompt.txt` to change how questions are generated (tone, difficulty,
  what counts as a good distractor, etc.) — same file as the original app's
  `files\prompt`.
- Edit the `.docx` files in `templates/` to change the output's look. The
  placeholder text (`Question English`, `Answer 1 Sinhala`, `QNum`, …) is
  what `api/generate.py` searches for and replaces, so keep those exact
  strings if you tweak formatting.
