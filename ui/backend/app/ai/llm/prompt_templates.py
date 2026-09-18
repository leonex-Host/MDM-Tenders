"""
Leonex AI — Professional System Prompt & Response Templates
Built to behave like a real ChatGPT-caliber assistant with
Leonex brand identity and deep tender domain expertise.
"""
from typing import List, Dict, Any
from datetime import datetime


class PromptTemplates:
    """
    Professional-grade prompt templates and system prompts.
    """

    @staticmethod
    def system_prompt() -> str:
        """
        The master identity prompt for Leonex AI.
        This defines the AI's full personality, knowledge, and behavior.
        """
        now = datetime.now().strftime("%d %B %Y, %I:%M %p")
        return f"""You are **Leonex AI** — a highly intelligent, professional AI assistant built by Leonex Systems Pvt. Ltd.

## Your Identity
- **Created by:** Leonex Systems Pvt. Ltd. (https://leonex.net/)
- **Company mission:** Empowering organizations through cutting-edge software, data intelligence, and AI-powered platforms.
- **Your role:** Expert assistant for the TENDER platform — an enterprise-grade tender intelligence system specializing in Indian government procurement.
- **Current time:** {now}

## Your Personality & Communication Style
- Speak in a warm, clear, confident, professional tone — exactly like ChatGPT.
- When users say "hi", "hello", "hey" or similar greetings, respond naturally and warmly. Always introduce yourself briefly.
- When users ask casual questions, answer conversationally. You are NOT a search bot.
- Format all longer responses with clean Markdown: use **bold**, bullet points (•), headers (##), and code blocks where appropriate.
- Never use technical jargon, internal system terms, or reveal database structure to the user.
- When you don't know something, say so honestly and offer to help in another way.
- Keep responses concise but thorough. Don't pad. Don't repeat yourself.
- Always end with a natural follow-up offer or question to keep the conversation flowing.

## Your Capabilities (Tender Intelligence)
You have real-time access to a live database of Indian government tenders. You can help with:
1. **Searching Tenders** — Find tenders by keywords, categories, or domains (e.g., MDM, data governance, material codification, IT services).
2. **Statistics & Analytics** — Provide counts, source breakdowns, location summaries, and trends.
3. **Urgent/Expiring Tenders** — Alert users to tenders with imminent deadlines.
4. **High-Value Opportunities** — Highlight large-value government contracts (in Crore/Lakh).
5. **Recent Tenders** — Surface the latest published tenders from all sources.
6. **Detailed Explanations** — Help users understand tender requirements, eligibility, and procedures.

## About Leonex
Leonex Systems Pvt. Ltd. is a technology company focused on enterprise software, AI, and data solutions. 
Key products include: TENDER (procurement intelligence), MDM tools, and AI-powered business analytics.
Website: https://leonex.net/ | LinkedIn: https://www.linkedin.com/company/leonex-systems-pvt-ltd/

## Critical Rules
- NEVER say "I'm an AI language model" or "As an AI, I...". You ARE Leonex AI. Own it.
- NEVER return raw database error messages to the user.
- ALWAYS respond in English unless the user speaks another language first.
- NEVER fabricate tender data. Only report what the real database provides.
- For casual conversation (greetings, jokes, thanks, questions about yourself), respond naturally without forcing tender searches.
- If a user's message is ambiguous, use context from conversation history to interpret it correctly.
"""

    @staticmethod
    def greeting_response(user_name: str = None) -> str:
        """Warm greeting when user says hi/hello."""
        now = datetime.now()
        hour = now.hour
        if hour < 12:
            time_of_day = "Good morning"
        elif hour < 17:
            time_of_day = "Good afternoon"
        else:
            time_of_day = "Good evening"

        name_part = f", {user_name}" if user_name else ""

        return f"""{time_of_day}{name_part}! 👋

I'm **Leonex AI**, your intelligent assistant for the TENDER platform powered by **Leonex Systems Pvt. Ltd.**

I can help you:
• 🔍 **Search** for government tenders by keyword or category
• 📊 **Analyze** tender statistics and source breakdowns
• ⚠️ **Track** expiring or urgent tenders
• 💰 **Discover** high-value procurement opportunities
• 📅 **Surface** the latest tenders from all sources

What would you like to explore today?"""

    @staticmethod
    def build_conversational_prompt(user_message: str, history: str, db_context: str = None) -> str:
        """
        Build a full conversational prompt for the LLM.
        This is the main prompt used when sending to Ollama.
        """
        context_section = ""
        if db_context:
            context_section = f"""
## Live Database Context
The following real tender data was retrieved for this query. Use it to answer:
{db_context}
"""

        history_section = ""
        if history:
            history_section = f"""
## Conversation History
{history}
"""

        return f"""{PromptTemplates.system_prompt()}
{context_section}
{history_section}
## Current User Message
User: {user_message}

Respond naturally, professionally, and helpfully as Leonex AI:"""

    @staticmethod
    def search_response(tenders: List[Dict], query: str) -> str:
        """Fallback template when LLM is unavailable — search results."""
        if not tenders:
            return (
                f"I searched for **{query}** but couldn't find any matching tenders in the database right now.\n\n"
                "Try rephrasing with different keywords, such as:\n"
                "• `master data management`\n"
                "• `data governance`\n"
                "• `material codification`\n"
                "• `IT infrastructure`\n\n"
                "Or ask me to show the latest or most recent tenders!"
            )

        response = f"Here are the top results I found for **{query}**:\n\n"
        for i, t in enumerate(tenders[:5], 1):
            response += f"**{i}. {t.get('title', 'Untitled')}**\n"
            response += f"• Tender ID: `{t.get('tender_id', 'N/A')}`\n"
            response += f"• Source: {t.get('source', 'N/A').upper()}\n"
            response += f"• Deadline: {t.get('end_date', 'N/A')}\n"
            if t.get('location'):
                response += f"• Location: {t.get('location')}\n"
            response += "\n"

        if len(tenders) > 5:
            response += f"*...and {len(tenders) - 5} more results.* Ask me to refine or show more!\n"

        return response

    @staticmethod
    def stats_response(stats: Dict[str, Any]) -> str:
        """Fallback template — statistics."""
        if not stats:
            return "I wasn't able to retrieve statistics at this time. Try again shortly."

        response = "## 📊 Tender Database Overview\n\n"
        response += f"| Metric | Value |\n|--------|-------|\n"
        response += f"| Total Tenders | **{stats.get('total_tenders', 0):,}** |\n"
        response += f"| Active Tenders | **{stats.get('active_tenders', 0):,}** |\n"
        response += f"| High Relevance (70%+) | **{stats.get('high_relevance_tenders', 0):,}** |\n\n"

        if stats.get('by_source'):
            response += "**By Source:**\n"
            for source, count in list(stats['by_source'].items())[:6]:
                response += f"• {source.upper()}: {count:,}\n"

        response += "\nNeed more specific data? Ask me about locations, keywords, or value ranges!"
        return response

    @staticmethod
    def expiring_response(tenders: List[Dict], days: int) -> str:
        """Fallback template — expiring tenders."""
        if not tenders:
            return f"✅ No tenders are expiring in the next **{days} days**. You're clear for now!\n\nWant me to check a different time window?"

        response = f"⚠️ **{len(tenders)} Tenders Expiring Within {days} Days**\n\n"
        for t in tenders[:5]:
            raw_end = t.get('end_date')
            days_left = "?"
            if raw_end:
                try:
                    days_left = (raw_end - datetime.now()).days
                except Exception:
                    pass
            response += f"• **{t.get('title', 'Untitled')}**\n"
            response += f"  — Deadline: {t.get('end_date', 'N/A')} ({days_left} days left)\n"
            response += f"  — ID: `{t.get('tender_id', 'N/A')}`\n\n"

        return response

    @staticmethod
    def high_value_response(tenders: List[Dict]) -> str:
        """Fallback template — high value tenders."""
        if not tenders:
            return "No high-value tenders found right now. Try searching with different value criteria."

        response = "💰 **High-Value Procurement Opportunities**\n\n"
        for t in tenders[:5]:
            value = t.get('value', 0) or 0
            if value >= 10_000_000:
                value_str = f"₹{value / 10_000_000:.2f} Cr"
            elif value >= 100_000:
                value_str = f"₹{value / 100_000:.2f} Lakh"
            else:
                value_str = f"₹{value:,.0f}" if value else "Value N/A"

            response += f"• **{t.get('title', 'Untitled')}**\n"
            response += f"  — Value: {value_str}\n"
            response += f"  — Source: {t.get('source', 'N/A').upper()} | Deadline: {t.get('end_date', 'N/A')}\n\n"

        return response

    @staticmethod
    def help_response() -> str:
        """Conversational help guide."""
        return """Hey! Here's everything I can help you with:

## 🔍 Search For Tenders
*"Find MDM tenders"* | *"Search data governance opportunities"* | *"Show IT tenders in Delhi"*

## 📊 Analytics & Stats
*"How many tenders are there?"* | *"Show statistics"* | *"Tenders by source"*

## ⚠️ Urgent & Expiring
*"Show me expiring tenders"* | *"Any deadlines this week?"* | *"Urgent opportunities"*

## 💰 High-Value Contracts
*"High-value tenders"* | *"Show tenders above 1 crore"* | *"Big government contracts"*

## 📅 Recent Activity
*"Show latest tenders"* | *"What's new today?"* | *"Recent MDM postings"*

---
Just talk to me naturally — I understand context and follow-up questions. What can I help you find? 😊"""