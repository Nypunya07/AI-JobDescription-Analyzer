// ============================================================
// server/index.js — The Express Backend Server
// ============================================================
// This file has three responsibilities:
//   1. Serve the frontend HTML/CSS/JS files to the browser
//   2. Expose one API route: POST /api/analyze
//   3. Call the Google Gemini API and return structured JSON

// ─── IMPORTS ────────────────────────────────────────────────
// "import" is ES Module syntax — enabled by "type": "module" in package.json.
// Think of imports like "include this toolbox before I start cooking."

import 'dotenv/config';               // Reads .env and loads GEMINI_API_KEY into process.env
import express from 'express';        // The web server framework
import path from 'path';              // Node.js built-in: safely joins file paths across OS
import { fileURLToPath } from 'url';  // Node.js built-in: converts a file URL to a path string
import { GoogleGenAI } from '@google/genai'; // Official Google Gemini SDK

// ─── __dirname FIX FOR ES MODULES ───────────────────────────
// In older CommonJS Node.js, __dirname was a free variable giving you the current folder path.
// In ES Modules (which we're using), __dirname doesn't exist — we recreate it manually.
const __filename = fileURLToPath(import.meta.url); // → "s:/p/AI-Job-Analyzer/server/index.js"
const __dirname = path.dirname(__filename);         // → "s:/p/AI-Job-Analyzer/server"

// ─── EXPRESS APP SETUP ──────────────────────────────────────
const app = express();   // Creates the Express application
const PORT = 3000;       // The port your server listens on: http://localhost:3000

// ─── MIDDLEWARE ─────────────────────────────────────────────
// Middleware = functions that process every request before it hits your route.
// app.use() registers middleware globally.

// 1. JSON body parser
//    Without this, req.body would be undefined.
//    With this, Express reads the raw JSON string from the request and gives you a JS object.
app.use(express.json());

// 2. Static file server
//    Tells Express: "if a browser requests a file, look for it inside the public/ folder."
//    path.join(__dirname, '..', 'public') = "server/../public" = "AI-Job-Analyzer/public"
//    When the browser asks for "/", Express automatically sends "public/index.html".
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── GEMINI SDK SETUP ───────────────────────────────────────
// Create one instance of the SDK, reused for every request.
// The API key is read from process.env (loaded by dotenv/config above).
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ─── API ROUTE: POST /api/analyze ───────────────────────────
// This is the only custom route in our application.
//
// Request body the frontend sends:
//   { "jobDescription": "We are looking for a React developer...", "userSkills": "HTML, CSS, JS" }
//
// Response we send back:
//   { "requiredSkills": [...], "matchedSkills": [...], "missingSkills": [...], "recommendations": [...] }
//
// "async" makes this function able to use "await" for the Gemini call.
app.post('/api/analyze', async (req, res) => {

  // ── STEP 1: Extract inputs from the request body ──────────
  const { jobDescription, userSkills } = req.body;

  // ── STEP 2: Input validation ──────────────────────────────
  // Always validate on the server — never trust the client alone.
  if (!jobDescription || !userSkills) {
    // HTTP 400 = "Bad Request" (the client sent incomplete data)
    return res.status(400).json({
      error: 'Both jobDescription and userSkills are required.'
    });
  }

  if (jobDescription.trim().length < 50) {
    return res.status(400).json({
      error: 'Job description is too short. Please paste the full job description.'
    });
  }

  if (userSkills.trim().length < 3) {
    return res.status(400).json({
      error: 'Please enter at least one skill.'
    });
  }

  // ── STEP 3: Build the Gemini Prompt ──────────────────────
  // Prompt engineering: we instruct Gemini to return ONLY a JSON object.
  // The clearer your instructions, the more reliable the output.
  const prompt = `
You are an expert technical recruiter and career advisor.

Analyze the job description and the candidate's skills provided below.
Your response must be a VALID JSON object ONLY.
Do NOT include markdown, code blocks, explanations, or any extra text.

Job Description:
${jobDescription}

Candidate's Skills:
${userSkills}

Return this exact JSON structure:
{
  "requiredSkills": ["skill1", "skill2", "skill3"],
  "matchedSkills": ["skill1"],
  "missingSkills": ["skill2", "skill3"],
  "recommendations": [
    {
      "skill": "skill name",
      "reason": "why this specific skill is important for this role",
      "resource": "a specific, free learning resource (e.g. 'freeCodeCamp React course', 'MDN Web Docs', 'official Python docs')"
    }
  ]
}

Rules you MUST follow:
- requiredSkills: every technical skill mentioned in the job description
- matchedSkills: skills from requiredSkills that also appear in the candidate's skills (case-insensitive match)
- missingSkills: skills from requiredSkills that do NOT appear in the candidate's skills
- recommendations: one entry per missingSkill, with a practical and specific learning resource
- Return ONLY the raw JSON object. Absolutely no text outside the JSON.
`;

  try {
    // ── STEP 4: Call Gemini using the Interactions (Chat) API ─
    // ai.chats.create() opens a new conversation session with Gemini.
    // We use the chat API (Interactions API) instead of a one-shot call.
    const chat = ai.chats.create({
      model: 'gemini-3.8-flash',   // The Gemini model to use
    });

    // chat.sendMessage() sends our prompt as the first user message.
    // "await" pauses execution here until Gemini responds — without blocking the server.
    const response = await chat.sendMessage({
      message: prompt,
    });

    // response.text is a GETTER on GenerateContentResponse — access it as a property, no ()
    const rawText = response.text.trim();

    // ── STEP 5: Clean and parse the JSON response ──────────
    // Even when instructed not to, Gemini occasionally wraps JSON in markdown:
    //   ```json { ... } ```
    // We strip those fences before parsing.
    const cleanedText = rawText
      .replace(/^```json\s*/i, '')  // Remove leading ```json
      .replace(/^```\s*/i, '')      // Remove leading ```
      .replace(/```\s*$/i, '')      // Remove trailing ```
      .trim();

    // JSON.parse() converts the JSON string into a JavaScript object.
    // If the string is not valid JSON, it throws a SyntaxError (caught below).
    const result = JSON.parse(cleanedText);

    // ── STEP 6: Send the result back to the frontend ───────
    // res.json() converts the JS object to a JSON string and sends it with status 200.
    res.json(result);

  } catch (error) {
    // ── ERROR HANDLING ─────────────────────────────────────
    // Two distinct error types can be thrown here:
    //
    // 1. ApiError (from @google/genai) — thrown when the Gemini API returns a non-2xx
    //    HTTP response. Has: error.status (numeric HTTP code), error.message (raw JSON body).
    //
    // 2. Plain Error / TypeError — thrown when the Node.js fetch() inside the SDK
    //    fails at the NETWORK level before the API even responds (e.g. DNS failure,
    //    connection refused, timeout). In this case error.status is undefined and
    //    error.message is a low-level string like "fetch failed".
    //
    // We must check for the network failure case first, before branching on error.status,
    // because undefined === 503 etc. are all false and it falls to the generic 500.

    // Always log the full error so the terminal shows the real cause.
    console.error('❌ Gemini error | status:', error.status, '| message:', error.message);

    if (error instanceof SyntaxError) {
      // JSON.parse() failed — Gemini responded but its output wasn't valid JSON.
      return res.status(500).json({
        error: 'The AI returned an unexpected response format. Please try again.'
      });
    }

    // Network-level failure: the SDK's internal fetch() could not reach Google's servers.
    // error.status is undefined; error.message is "fetch failed" or similar.
    if (error.status === undefined && error.message && error.message.includes('fetch failed')) {
      return res.status(503).json({
        error: 'Could not reach the Gemini API. Check your internet connection and try again.',
        retryable: true   // transient network failure — safe to retry
      });
    }

    // Use error.status (numeric) for precise branching — set by the SDK's ApiError class.
    const httpStatus = error.status;

    if (httpStatus === 503 || httpStatus === 529) {
      // Gemini is temporarily overloaded — the key and model are fine.
      return res.status(503).json({
        error: 'Gemini is experiencing high demand right now. Please wait a moment and try again.',
        retryable: true   // temporary overload — the frontend should retry with backoff
      });
    }

    if (httpStatus === 401 || httpStatus === 403) {
      // Bad or missing API key — permanent, no point retrying.
      return res.status(401).json({
        error: 'Invalid or missing Gemini API key. Please check your .env file and restart the server.',
        retryable: false
      });
    }

    if (httpStatus === 404) {
      // Model name not recognised by the API — permanent, no point retrying.
      return res.status(404).json({
        error: 'Gemini model not found. Please check the model name in server/index.js.',
        retryable: false
      });
    }

    if (httpStatus === 400) {
      // Bad request — usually a prompt or parameter issue. Not worth retrying.
      return res.status(400).json({
        error: 'The request was rejected by Gemini. Please try again with a different input.',
        retryable: false
      });
    }

    if (httpStatus === 429) {
      // Rate limit exceeded — transient, retry with longer backoff.
      return res.status(429).json({
        error: 'Gemini rate limit reached. Please wait a moment and try again.',
        retryable: true   // rate limits are temporary — safe to retry
      });
    }

    // Catch-all: for any error not matched above, include the raw message in the
    // server log (already logged above) so the cause is never hidden.
    res.status(500).json({
      error: `Unexpected error: ${error.message || 'unknown'}. Check the server terminal for details.`
    });
  }
});

// ─── START THE SERVER ────────────────────────────────────────
// app.listen() starts the HTTP server on the given port.
// The callback runs once the server is ready to accept requests.
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`📂 Serving frontend from: public/`);
  console.log(`🔗 API endpoint: POST http://localhost:${PORT}/api/analyze`);
});
