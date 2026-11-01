# AI Job Description Analyzer

An AI-powered web application that analyzes job descriptions and compares their required skills with a user's existing technical skills. It helps users identify skill gaps and understand what they need to learn for a particular job role.

## Features

- **Job Description Analysis:** Paste a job description to identify the technical skills and requirements.
- **Skill Matching:** Compare your existing technical skills against the skills required for the job.
- **Missing Skills Identification:** Discover the skills you need to develop.
- **Skill Gap Analysis:** View a summary of required skills, matched skills, and missing skills.
- **AI-Powered Recommendations:** Get suggestions for improving your technical skill set.
- **Interactive Interface:** Simple interface for entering job descriptions and technical skills and viewing analysis results.

## Tech Stack

| Technology | Purpose |
|---|---|
| HTML5 | Frontend structure |
| CSS3 | Styling and user interface |
| JavaScript | Frontend functionality |
| Node.js | Backend runtime |
| Express.js | REST API and server |
| Google Gemini API | AI-powered job description analysis |
| dotenv | Environment variable management |

## Project Structure

```text
AI-Job-Analyzer/
│
├── public/
│   ├── index.html
│   ├── style.css
│   └── script.js
│
├── server/
│   └── index.js
│
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Nypunya07/AI-Job-Analyzer.git
```

### 2. Navigate to the project directory

```bash
cd AI-Job-Analyzer
```

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment variables

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key
PORT=3000
```

Get your Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

**Important:** Never commit your `.env` file or expose your API key on GitHub.

### 5. Start the application

```bash
npm start
```

### 6. Open in your browser

```text
http://localhost:3000
```

## How It Works

1. Enter or paste a job description.
2. Add your existing technical skills, separated by commas.
3. Click **Analyze with Gemini**.
4. The backend sends the information to the Gemini API.
5. The application displays the skill analysis, including matched skills, missing skills, and recommendations.

## Learning Outcomes

Through this project, I am exploring:

- Integrating a third-party AI API into a Node.js application.
- Building backend endpoints using Express.js.
- Handling API requests and responses.
- Managing API keys securely with environment variables.
- Connecting frontend and backend components.
- Implementing error handling for external API failures.

## Future Improvements

- Improve AI response time and API reliability.
- Add resume upload and analysis.
- Generate personalized learning roadmaps.
- Save previous job analyses.
- Add user authentication and analysis history.

## Author

**Mallarapu Nypunya**



---

*Built as a learning project to explore backend development and AI API integration.*