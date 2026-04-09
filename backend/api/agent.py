"""Chat endpoint for the AI financial planning agent."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import ANTHROPIC_API_KEY
from dependencies import get_storage
from agent.loop import run_agent_loop
from storage.local import LocalFileStorage

router = APIRouter()


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []


class ChatResponse(BaseModel):
    response: str
    history: list[dict]


@router.post("/chat", response_model=ChatResponse)
def chat(
    request: ChatRequest,
    storage: LocalFileStorage = Depends(get_storage),
):
    """Send a message to the AI financial planning agent.

    The agent can read the user's profile, run simulations, and answer
    questions about their financial plan. Conversation history is maintained
    client-side and passed back each request.
    """
    if not ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="AI agent not configured. Set the ANTHROPIC_API_KEY environment variable.",
        )

    response_text, updated_history = run_agent_loop(
        user_message=request.message,
        history=request.history,
        storage=storage,
        api_key=ANTHROPIC_API_KEY,
    )

    return ChatResponse(response=response_text, history=updated_history)
