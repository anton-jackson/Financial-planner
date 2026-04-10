"""Agent loop: the core wiring that connects the LLM to your tools.

This is intentionally simple — a while loop that:
1. Sends the conversation + tool definitions to Claude
2. If Claude wants to call a tool, executes it and loops back
3. If Claude returns text, returns it to the user
"""

import json
import logging

import anthropic

from agent.tools import TOOLS
from agent.executor import execute_tool
from storage.local import LocalFileStorage

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are a financial planning assistant embedded in a personal finance app.
You have access to the user's financial profile, assets, and simulation engine.

Your job is to help the user understand their financial situation and explore
what-if scenarios. You can run projections, Monte Carlo simulations, and
compare scenarios using the tools available to you.

Guidelines:
- Start by fetching the user's profile/assets if needed to answer their question.
- Use concrete numbers from the tools — don't make up financial figures.
- When discussing projections, mention which percentile you're referencing
  (p10 = pessimistic, p50 = median, p90 = optimistic).
- For what-if questions, use the what_if tool to show before/after comparison.
- Keep responses conversational but precise. Round dollar amounts sensibly.
- If the user asks you to change their profile, explain that you can only run
  what-if analyses — actual changes must be made through the app's forms.
- When showing results, focus on the insight, not raw data dumps.
"""

MAX_TOOL_ROUNDS = 10


def run_agent_loop(
    user_message: str,
    history: list[dict],
    storage: LocalFileStorage,
    api_key: str,
) -> tuple[str, list[dict]]:
    """Run the agent loop and return (response_text, updated_history).

    Args:
        user_message: The new message from the user.
        history: Previous messages in Anthropic API format.
        storage: Storage backend for loading profile/assets/scenarios.
        api_key: Anthropic API key.

    Returns:
        Tuple of (assistant's text response, updated message history).
    """
    client = anthropic.Anthropic(api_key=api_key)

    messages = list(history)
    messages.append({"role": "user", "content": user_message})

    for _ in range(MAX_TOOL_ROUNDS):
        response = client.messages.create(
            model="claude-sonnet-4-5-20250514",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=messages,
        )

        # Append assistant response to history
        messages.append({"role": "assistant", "content": response.content})

        # Check if the model wants to use tools
        tool_uses = [b for b in response.content if b.type == "tool_use"]
        if not tool_uses:
            # No tool calls — extract text and return
            text = "\n".join(b.text for b in response.content if b.type == "text")
            return text, messages

        # Execute each tool call and collect results
        tool_results = []
        for tool_use in tool_uses:
            logger.info("Agent calling tool: %s(%s)", tool_use.name, tool_use.input)
            try:
                result = execute_tool(tool_use.name, tool_use.input, storage)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use.id,
                    "content": json.dumps(result, default=str),
                })
            except Exception as e:
                logger.exception("Tool execution failed: %s", tool_use.name)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use.id,
                    "content": json.dumps({"error": str(e)}),
                    "is_error": True,
                })

        messages.append({"role": "user", "content": tool_results})

    # Safety: if we hit max rounds, return what we have
    return "I've reached the maximum number of analysis steps. Here's what I found so far.", messages
