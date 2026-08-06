import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import dotenv from "dotenv";
import { ConvertToLegacy } from "./src/UnicodeToLegacy.js";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

const PROJECT_ROOT = process.cwd();
const TEMPLATES_DIR = path.join(PROJECT_ROOT, "templates");
const PROMPT_PATH = path.join(PROJECT_ROOT, "prompt.txt");
const PENDING_VOCAB_PATH = path.join(PROJECT_ROOT, "pending_vocab.json");

const TEMPLATE_FILES: Record<string, string> = {
  normal: path.join(TEMPLATES_DIR, "QuestionNormal.docx"),
  statement: path.join(TEMPLATES_DIR, "QuestionStatement.docx"),
  code: path.join(TEMPLATES_DIR, "QuestionCode.docx"),
};

const VALID_TYPES = new Set(Object.keys(TEMPLATE_FILES));

async function getPendingVocab(): Promise<Array<{ id: string; english: string; sinhala: string; date: string }>> {
  try {
    const data = await fs.promises.readFile(PENDING_VOCAB_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function savePendingVocab(list: Array<{ id: string; english: string; sinhala: string; date: string }>): Promise<void> {
  await fs.promises.writeFile(PENDING_VOCAB_PATH, JSON.stringify(list, null, 2), "utf-8");
}

function parseVocabulary(promptContent: string): Array<{ english: string; sinhala: string }> {
  const match = promptContent.match(/\[VOCAB_START\]([\s\S]*?)\[VOCAB_END\]/);
  if (!match) return [];
  const lines = match[1].split("\n");
  const vocab: Array<{ english: string; sinhala: string }> = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("-")) {
      const parts = trimmed.substring(1).split(":");
      if (parts.length >= 2) {
        const eng = parts[0].trim();
        const sin = parts.slice(1).join(":").trim();
        if (eng && sin) {
          vocab.push({ english: eng, sinhala: sin });
        }
      }
    }
  }
  return vocab;
}

function updateVocabularyInPrompt(
  promptContent: string,
  vocabList: Array<{ english: string; sinhala: string }>
): string {
  const vocabBlock =
    "[VOCAB_START]\n" +
    vocabList.map((item) => `- ${item.english}: ${item.sinhala}`).join("\n") +
    "\n[VOCAB_END]";

  if (promptContent.includes("[VOCAB_START]")) {
    return promptContent.replace(
      /\[VOCAB_START\][\s\S]*?\[VOCAB_END\]/,
      vocabBlock
    );
  } else {
    return promptContent + "\n\n5) Mandatory Vocabulary Mapping\n[VOCAB_START]\n" + vocabBlock + "\n[VOCAB_END]\n";
  }
}

function extractJson(rawText: string): any {
  let text = rawText.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-zA-Z]*\n?/, "");
    text = text.replace(/```\s*$/, "").trim();
  }
  return JSON.parse(text);
}

function buildReplacements(resdict: any, qtype: string): Record<string, string> {
  if (qtype === "normal") {
    return {
      "Question English": resdict["QEng"] || "",
      "Question Sinhala": ConvertToLegacy(resdict["QSin"] || ""),

      "Answer 1 English": resdict["AnswersEng"]?.[0] || "",
      "Answer 2 English": resdict["AnswersEng"]?.[1] || "",
      "Answer 3 English": resdict["AnswersEng"]?.[2] || "",
      "Answer 4 English": resdict["AnswersEng"]?.[3] || "",
      "Answer 5 English": resdict["AnswersEng"]?.[4] || "",
      "Answer 1 Sinhala": ConvertToLegacy(resdict["AnswersSin"]?.[0] || ""),
      "Answer 2 Sinhala": ConvertToLegacy(resdict["AnswersSin"]?.[1] || ""),
      "Answer 3 Sinhala": ConvertToLegacy(resdict["AnswersSin"]?.[2] || ""),
      "Answer 4 Sinhala": ConvertToLegacy(resdict["AnswersSin"]?.[3] || ""),
      "Answer 5 Sinhala": ConvertToLegacy(resdict["AnswersSin"]?.[4] || ""),

      "Explanation 1 English": resdict["ExplEng"]?.[0] || "",
      "Explanation 2 English": resdict["ExplEng"]?.[1] || "",
      "Explanation 3 English": resdict["ExplEng"]?.[2] || "",
      "Explanation 4 English": resdict["ExplEng"]?.[3] || "",
      "Explanation 5 English": resdict["ExplEng"]?.[4] || "",
      "Explanation 1 Sinhala": ConvertToLegacy(resdict["ExplSin"]?.[0] || ""),
      "Explanation 2 Sinhala": ConvertToLegacy(resdict["ExplSin"]?.[1] || ""),
      "Explanation 3 Sinhala": ConvertToLegacy(resdict["ExplSin"]?.[2] || ""),
      "Explanation 4 Sinhala": ConvertToLegacy(resdict["ExplSin"]?.[3] || ""),
      "Explanation 5 Sinhala": ConvertToLegacy(resdict["ExplSin"]?.[4] || ""),

      "QNum": String(resdict["AnsNo"] ?? ""),
    };
  }

  if (qtype === "statement") {
    return {
      "Question English": resdict["QEng"] || "",
      "Question Sinhala": ConvertToLegacy(resdict["QSin"] || ""),

      "StateAEng": resdict["StatementsEng"]?.[0] || "",
      "StateBEng": resdict["StatementsEng"]?.[1] || "",
      "StateCEng": resdict["StatementsEng"]?.[2] || "",
      "StateASin": ConvertToLegacy(resdict["StatementsSin"]?.[0] || ""),
      "StateBSin": ConvertToLegacy(resdict["StatementsSin"]?.[1] || ""),
      "StateCSin": ConvertToLegacy(resdict["StatementsSin"]?.[2] || ""),

      "Answer 1 English": resdict["AnswersEng"]?.[0] || "",
      "Answer 2 English": resdict["AnswersEng"]?.[1] || "",
      "Answer 3 English": resdict["AnswersEng"]?.[2] || "",
      "Answer 4 English": resdict["AnswersEng"]?.[3] || "",
      "Answer 5 English": resdict["AnswersEng"]?.[4] || "",
      "Answer 1 Sinhala": ConvertToLegacy(resdict["AnswersSin"]?.[0] || ""),
      "Answer 2 Sinhala": ConvertToLegacy(resdict["AnswersSin"]?.[1] || ""),
      "Answer 3 Sinhala": ConvertToLegacy(resdict["AnswersSin"]?.[2] || ""),
      "Answer 4 Sinhala": ConvertToLegacy(resdict["AnswersSin"]?.[3] || ""),
      "Answer 5 Sinhala": ConvertToLegacy(resdict["AnswersSin"]?.[4] || ""),

      "ExplAEng": resdict["ExplEng"]?.[0] || "",
      "ExplBEng": resdict["ExplEng"]?.[1] || "",
      "ExplCEng": resdict["ExplEng"]?.[2] || "",
      "ExplASin": ConvertToLegacy(resdict["ExplSin"]?.[0] || ""),
      "ExplBSin": ConvertToLegacy(resdict["ExplSin"]?.[1] || ""),
      "ExplCSin": ConvertToLegacy(resdict["ExplSin"]?.[2] || ""),

      "QNum": String(resdict["AnsNo"] ?? ""),
    };
  }

  if (qtype === "code") {
    return {
      "Question English": resdict["QEng"] || "",
      "Question Sinhala": ConvertToLegacy(resdict["QSin"] || ""),

      "codelines": resdict["Code"] || "",

      "Answer 1 English": resdict["AnswersEng"]?.[0] || "",
      "Answer 2 English": resdict["AnswersEng"]?.[1] || "",
      "Answer 3 English": resdict["AnswersEng"]?.[2] || "",
      "Answer 4 English": resdict["AnswersEng"]?.[3] || "",
      "Answer 5 English": resdict["AnswersEng"]?.[4] || "",
      "Answer 1 Sinhala": ConvertToLegacy(resdict["AnswersSin"]?.[0] || ""),
      "Answer 2 Sinhala": ConvertToLegacy(resdict["AnswersSin"]?.[1] || ""),
      "Answer 3 Sinhala": ConvertToLegacy(resdict["AnswersSin"]?.[2] || ""),
      "Answer 4 Sinhala": ConvertToLegacy(resdict["AnswersSin"]?.[3] || ""),
      "Answer 5 Sinhala": ConvertToLegacy(resdict["AnswersSin"]?.[4] || ""),

      "ExplanationEnglish": resdict["ExplEng"] || "",
      "ExplanationSinhala": ConvertToLegacy(resdict["ExplSin"] || ""),

      "QNum": String(resdict["AnsNo"] ?? ""),
    };
  }

  throw new Error(`Unknown question type: ${qtype}`);
}

async function findAndReplaceInDocx(
  templatePath: string,
  replacements: Record<string, string>
): Promise<Buffer> {
  const content = await fs.promises.readFile(templatePath);
  const zip = await JSZip.loadAsync(content);

  const xmlFiles = Object.keys(zip.files).filter((filename) =>
    /^word\/.*\.xml$/.test(filename)
  );
  const domParser = new DOMParser();
  const xmlSerializer = new XMLSerializer();

  for (const xmlFile of xmlFiles) {
    const fileObj = zip.file(xmlFile);
    if (!fileObj) continue;
    const xmlText = await fileObj.async("string");
    const doc = domParser.parseFromString(xmlText, "text/xml");

    const paragraphs = doc.getElementsByTagName("w:p");
    let modified = false;

    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs.item(i);
      if (!p) continue;

      const tElements = p.getElementsByTagName("w:t");
      if (!tElements || tElements.length === 0) continue;

      let pText = "";
      for (let j = 0; j < tElements.length; j++) {
        pText += tElements.item(j)?.textContent || "";
      }

      let hasMatch = false;
      for (const oldKey of Object.keys(replacements)) {
        if (pText.includes(oldKey)) {
          hasMatch = true;
          break;
        }
      }

      if (hasMatch) {
        for (const [oldKey, newKey] of Object.entries(replacements)) {
          pText = pText.replaceAll(oldKey, newKey);
        }

        const firstT = tElements.item(0);
        if (firstT) {
          if (pText.includes("\n")) {
            const parent = firstT.parentNode;
            if (parent) {
              const lines = pText.split("\n");
              for (let l = 0; l < lines.length; l++) {
                if (l > 0) {
                  const br = doc.createElementNS(
                    "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
                    "w:br"
                  );
                  parent.insertBefore(br, firstT);
                }
                const tNode = doc.createElementNS(
                  "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
                  "w:t"
                );
                if (lines[l].startsWith(" ") || lines[l].endsWith(" ")) {
                  tNode.setAttribute("xml:space", "preserve");
                }
                tNode.textContent = lines[l];
                parent.insertBefore(tNode, firstT);
              }
              parent.removeChild(firstT);
            }
          } else {
            if (pText.startsWith(" ") || pText.endsWith(" ")) {
              firstT.setAttribute("xml:space", "preserve");
            }
            firstT.textContent = pText;
          }
        }

        for (let j = 1; j < tElements.length; j++) {
          const t = tElements.item(j);
          if (t) {
            t.textContent = "";
          }
        }
        modified = true;
      }
    }

    if (modified) {
      const updatedXml = xmlSerializer.serializeToString(doc);
      zip.file(xmlFile, updatedXml);
    }
  }

  return await zip.generateAsync({ type: "nodebuffer" });
}

// Serve static assets
app.use("/static", express.static(path.join(PROJECT_ROOT, "static")));

app.get("/", (req: Request, res: Response) => {
  res.sendFile(path.join(PROJECT_ROOT, "index.html"));
});

// Public: Get active vocabulary
app.get("/api/vocabulary", async (req: Request, res: Response) => {
  try {
    const prompt = await fs.promises.readFile(PROMPT_PATH, "utf-8");
    const vocab = parseVocabulary(prompt);
    return res.json(vocab);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to read prompt file." });
  }
});

// Public: Submit a word translation suggestion (goes to pending queue for admin review)
app.post("/api/vocabulary/suggest", async (req: Request, res: Response) => {
  const { english, sinhala } = req.body || {};
  const eng = (english || "").trim();
  const sin = (sinhala || "").trim();

  if (!eng || !sin) {
    return res.status(400).json({ error: "Both English and Sinhala words are required." });
  }

  try {
    const pending = await getPendingVocab();
    const existing = pending.find((item) => item.english.toLowerCase() === eng.toLowerCase());
    if (existing) {
      existing.sinhala = sin;
      existing.date = new Date().toISOString();
    } else {
      pending.push({
        id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
        english: eng,
        sinhala: sin,
        date: new Date().toISOString(),
      });
    }
    await savePendingVocab(pending);
    return res.json({ success: true, message: "Translation suggestion submitted for admin review!" });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to save translation suggestion." });
  }
});

// Admin: Get pending suggestions
app.get("/api/admin/pending", async (req: Request, res: Response) => {
  try {
    const pending = await getPendingVocab();
    return res.json(pending);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to read pending suggestions." });
  }
});

// Admin: Approve a pending suggestion (writes to prompt.txt)
app.post("/api/admin/approve", async (req: Request, res: Response) => {
  const { id } = req.body || {};
  if (!id) {
    return res.status(400).json({ error: "Suggestion ID is required." });
  }

  try {
    const pending = await getPendingVocab();
    const target = pending.find((item) => item.id === id);
    if (!target) {
      return res.status(404).json({ error: "Pending suggestion not found." });
    }

    const prompt = await fs.promises.readFile(PROMPT_PATH, "utf-8");
    const vocab = parseVocabulary(prompt);

    const existingIndex = vocab.findIndex(
      (v) => v.english.toLowerCase() === target.english.toLowerCase()
    );
    if (existingIndex >= 0) {
      vocab[existingIndex] = { english: target.english, sinhala: target.sinhala };
    } else {
      vocab.push({ english: target.english, sinhala: target.sinhala });
    }

    const updatedPrompt = updateVocabularyInPrompt(prompt, vocab);
    await fs.promises.writeFile(PROMPT_PATH, updatedPrompt, "utf-8");

    // Remove from pending
    const remaining = pending.filter((item) => item.id !== id);
    await savePendingVocab(remaining);

    return res.json({ success: true, vocabulary: vocab, pending: remaining });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to approve suggestion." });
  }
});

// Admin: Reject a pending suggestion
app.post("/api/admin/reject", async (req: Request, res: Response) => {
  const { id } = req.body || {};
  if (!id) {
    return res.status(400).json({ error: "Suggestion ID is required." });
  }

  try {
    const pending = await getPendingVocab();
    const remaining = pending.filter((item) => item.id !== id);
    await savePendingVocab(remaining);
    return res.json({ success: true, pending: remaining });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to reject suggestion." });
  }
});

// Admin: Direct add word
app.post("/api/admin/add", async (req: Request, res: Response) => {
  const { english, sinhala } = req.body || {};
  const eng = (english || "").trim();
  const sin = (sinhala || "").trim();

  if (!eng || !sin) {
    return res.status(400).json({ error: "Both English and Sinhala words are required." });
  }

  try {
    const prompt = await fs.promises.readFile(PROMPT_PATH, "utf-8");
    const vocab = parseVocabulary(prompt);

    const existingIndex = vocab.findIndex(
      (v) => v.english.toLowerCase() === eng.toLowerCase()
    );
    if (existingIndex >= 0) {
      vocab[existingIndex] = { english: eng, sinhala: sin };
    } else {
      vocab.push({ english: eng, sinhala: sin });
    }

    const updatedPrompt = updateVocabularyInPrompt(prompt, vocab);
    await fs.promises.writeFile(PROMPT_PATH, updatedPrompt, "utf-8");

    return res.json({ success: true, vocabulary: vocab });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to add word to prompt file." });
  }
});

// Admin: Direct delete word
app.delete("/api/admin/delete", async (req: Request, res: Response) => {
  const { english } = req.body || {};
  const eng = (english || "").trim();

  if (!eng) {
    return res.status(400).json({ error: "English word is required for deletion." });
  }

  try {
    const prompt = await fs.promises.readFile(PROMPT_PATH, "utf-8");
    const vocab = parseVocabulary(prompt);

    const filtered = vocab.filter(
      (v) => v.english.toLowerCase() !== eng.toLowerCase()
    );

    const updatedPrompt = updateVocabularyInPrompt(prompt, filtered);
    await fs.promises.writeFile(PROMPT_PATH, updatedPrompt, "utf-8");

    return res.json({ success: true, vocabulary: filtered });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to delete vocabulary from prompt file." });
  }
});

// Public: Translate English text to Sinhala
app.post("/api/translate", async (req: Request, res: Response) => {
  const payload = req.body || {};
  const text = (payload.text || "").trim();
  const model = (payload.model || "gemini-3.6-flash").trim();
  const userApiKey = (payload.apiKey || req.headers["x-api-key"] || "").toString().trim();

  if (!text) {
    return res.status(400).json({ error: "Please enter text to translate." });
  }

  const apiKey = userApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      error: "Gemini API key is required. Please enter your Gemini API key.",
    });
  }

  let vocabListText = "";
  try {
    const promptContent = await fs.promises.readFile(PROMPT_PATH, "utf-8");
    const vocab = parseVocabulary(promptContent);
    vocabListText = vocab.map((v) => `'${v.english}' as '${v.sinhala}'`).join(",\n");
  } catch {
    // Fallback if prompt file cannot be read
  }

  const translatorSystemPrompt = `Purpose and Goals:

* Translate any input provided by the user from English into Sinhala accurately and efficiently.
* Provide only the translated text as the output without any additional conversational filler, introductory phrases, explanations, or assistance with the content of the prompt.
* Consistently identify and use the correct Sinhala technical equivalents for IT-related terms, ensuring professional and academic accuracy.

Behaviors and Rules:

1) Strict Translation Mode:
 a) Upon receiving a prompt, immediately isolate the text intended for translation.
 b) Convert the text into Sinhala script (Unicode) using formal grammar and vocabulary.
 c) Output the Sinhala translation and nothing else. Prohibited phrases include 'Here is the translation', 'Translated text:', or 'How else can I help?'.
 d) If the user input is a question, do not answer it. Translate the question itself into Sinhala.
 e) dont include english terms withing brackets

2) Formatting and Terminology:
 a) Mirror the original formatting exactly, including line breaks, paragraphs, bullet points, and special characters.
 b) Use standard, high-level Sinhala syntax.

Mandatory Vocabulary Mapping: Always translate,
${vocabListText}

Apply this rigorous standard to all IT technical terms.

Overall Tone:

* Purely functional and robotic.
* Direct, concise, and utility-oriented.
* Non-conversational and devoid of personality or social pleasantries.

Text to translate:
${text}`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: model,
      contents: translatorSystemPrompt,
    });
    const unicodeTranslation = (response.text || "").trim();
    const legacyTranslation = ConvertToLegacy(unicodeTranslation);
    return res.json({ translation: legacyTranslation, unicode: unicodeTranslation });
  } catch (exc: any) {
    return res.status(502).json({ error: `The Gemini API request failed: ${exc?.message || exc}` });
  }
});

app.get("/api/generate", (req: Request, res: Response) => {
  res.status(405).json({ error: "Use POST with a JSON body to generate a question." });
});

app.post("/api/generate", async (req: Request, res: Response) => {
  const payload = req.body || {};
  const topic = (payload.topic || "").trim();
  const model = (payload.model || "").trim();
  const qtype = (payload.qtype || "normal").trim().toLowerCase();
  const userApiKey = (payload.apiKey || req.headers["x-api-key"] || "").toString().trim();

  if (!topic) {
    return res.status(400).json({ error: "Please enter a question topic." });
  }
  if (!model) {
    return res.status(400).json({ error: "Please enter a Gemini model name." });
  }
  if (!VALID_TYPES.has(qtype)) {
    return res.status(400).json({ error: `Unknown question type '${qtype}'.` });
  }

  const apiKey = userApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      error:
        "Gemini API key is required. Please enter your Gemini API key in the form.",
    });
  }

  let prompt = "";
  try {
    prompt = await fs.promises.readFile(PROMPT_PATH, "utf-8");
  } catch {
    return res.status(500).json({ error: "The prompt file is missing on the server." });
  }

  const questionTypeAndTopic = JSON.stringify({ topic, type: qtype });

  let responseText = "";
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt + questionTypeAndTopic,
    });
    responseText = response.text || "";
  } catch (exc: any) {
    return res.status(502).json({ error: `The Gemini API request failed: ${exc?.message || exc}` });
  }

  let resdict: any;
  try {
    resdict = extractJson(responseText);
  } catch {
    return res.status(502).json({
      error:
        "The model didn't return valid JSON, so no document could be built. " +
        "Try again, or try a different model.",
    });
  }

  const resultQtype = String(resdict.QType || qtype).trim().toLowerCase();
  if (!VALID_TYPES.has(resultQtype)) {
    return res.status(502).json({ error: `The model returned an unknown QType: '${resultQtype}'.` });
  }

  try {
    const replacements = buildReplacements(resdict, resultQtype);
    const templatePath = TEMPLATE_FILES[resultQtype];
    const docxBuffer = await findAndReplaceInDocx(templatePath, replacements);

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\..+/, "")
      .replace("T", "_");
    const safeTopic =
      topic.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "MCQ";
    const filename = `${safeTopic}_${resultQtype}_${timestamp}.docx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"; filename*=${filename}`
    );
    return res.send(docxBuffer);
  } catch (exc: any) {
    return res.status(500).json({ error: `Failed to build the document: ${exc?.message || exc}` });
  }
});

export default app;

if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}
