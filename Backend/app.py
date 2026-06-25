from fastapi import FastAPI, UploadFile, File, Form
from pydantic import BaseModel
from gemini_service import ask_gemini
from pypdf import PdfReader
import io
import uuid
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

app = FastAPI()

# 🔐 Permit cross-origin traffic safely
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://ai-interviewer-assistant-9q1q.vercel.app/"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions = {}

class AnswerRequest(BaseModel):
    session_id: str
    answer: str

# 📂 Serve index.html from the Frontend folder correctly
@app.get("/")
def serve_frontend():
    # Checking all possible locations for index.html relative to where you run it
    if os.path.exists("index.html"):
        return FileResponse("index.html")
    elif os.path.exists("../Frontend/index.html"):
        return FileResponse("../Frontend/index.html")
    elif os.path.exists("Frontend/index.html"):
        return FileResponse("Frontend/index.html")
    return {"message": "Backend running, but index.html not found anywhere."}

def extract_text_from_pdf(file_bytes):
    reader = PdfReader(io.BytesIO(file_bytes))
    text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"
    return text

def extract_text_from_txt(file_bytes):
    return file_bytes.decode("utf-8")

@app.post("/start-interview")
async def start_interview(
    role: str = Form(...),
    resume: UploadFile = File(...)
):
    session_id = str(uuid.uuid4())
    file_bytes = await resume.read()
    filename = resume.filename.lower()

    if filename.endswith(".pdf"):
        resume_text = extract_text_from_pdf(file_bytes)
    elif filename.endswith(".txt"):
        resume_text = extract_text_from_txt(file_bytes)
    else:
        return {"error": "Only PDF and TXT files are supported"}

    MAX_CHARS = 3000
    if len(resume_text) > MAX_CHARS:
        resume_text = resume_text[:MAX_CHARS]

    prompt = f"""
    You are Emma, a professional US AI recruiter.
    Candidate Role: {role}
    Candidate Resume:
    {resume_text}
    
    Rules:
    1. Greet the candidate warmly and introduce yourself as Emma.
    2. Explain this is a structured interactive panel mock session.
    3. Ask ONLY ONE HR question based on resume data parameters to kick off.
    """

    question = ask_gemini(prompt)

    sessions[session_id] = {
        "resume": resume_text,
        "role": role,
        "stage": "HR",
        "history": [question]
    }

    return {
        "session_id": session_id,
        "question": question
    }

@app.post("/submit-answer")
def submit_answer(data: AnswerRequest):
    session = sessions.get(data.session_id)
    if not session:
        return {"error": "Session not found."}

    resume = session["resume"]
    role = session["role"]
    stage = session["stage"]
    history = "\n".join(session["history"])

    prompt = f"""
    You are Emma, a US AI interviewer.
    Stage: {stage}
    Role: {role}
    Resume: {resume}
    Conversation: {history}
    Candidate Answer: {data.answer}
    
    Rules:
    1. Ask ONLY ONE follow-up question.
    2. Progress conversation parameters smoothly matching candidate values.
    """

    response = ask_gemini(prompt)
    session["history"].append("Candidate: " + data.answer)
    session["history"].append("Emma: " + response)

    if len(session["history"]) > 4:
        session["stage"] = "TECH"

    sessions[data.session_id] = session

    return {
        "next_question": response,
        "stage": session["stage"]
    }

# 🛠️ Serve your matching CSS/JS assets from the right folder directory
if os.path.exists("../Frontend"):
    app.mount("/", StaticFiles(directory="../Frontend"), name="static")
elif os.path.exists("Frontend"):
    app.mount("/", StaticFiles(directory="Frontend"), name="static")
elif os.path.exists("."):
    app.mount("/", StaticFiles(directory="."), name="static")
