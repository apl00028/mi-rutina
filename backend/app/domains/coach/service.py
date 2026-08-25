from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Any

import httpx
from openai import OpenAI


LOCAL_PROVIDERS = {"", "none", "rules", "local"}
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AIResult:
    message: str
    provider: str
    model: str | None
    analysis_source: str


def provider_name() -> str:
    return os.getenv("AI_PROVIDER", "rules").strip().lower()


def configured_model(provider: str | None = None) -> str | None:
    selected = provider or provider_name()
    variables = {
        "gemini": "GEMINI_MODEL",
        "openai": "OPENAI_MODEL",
        "ollama": "OLLAMA_MODEL",
    }
    variable = variables.get(selected)
    return (os.getenv(variable, "").strip() or None) if variable else None


def configuration_status() -> dict[str, Any]:
    provider = provider_name()
    if provider in LOCAL_PROVIDERS:
        return {
            "enabled": False,
            "provider": "rules",
            "model": None,
            "status": "disabled",
        }
    model = configured_model(provider)
    secret_configured = {
        "gemini": bool(os.getenv("GEMINI_API_KEY", "").strip()),
        "openai": bool(os.getenv("OPENAI_API_KEY", "").strip()),
        "ollama": bool(os.getenv("OLLAMA_BASE_URL", "").strip()),
    }.get(provider, False)
    configured = provider in {"gemini", "openai", "ollama"} and bool(model) and secret_configured
    return {
        "enabled": configured,
        "provider": provider,
        "model": model,
        "status": "connected" if configured else "not_configured",
    }


def minimal_prompt(structured_analysis: dict[str, Any]) -> str:
    return (
        "Redacta en español un comentario breve y sobrio de entrenador. "
        "Utiliza únicamente los datos estructurados recibidos. No cambies las "
        "recomendaciones calculadas, no diagnostiques y no inventes información. "
        "Devuelve como máximo un título y dos frases cortas.\n\n"
        + json.dumps(structured_analysis, ensure_ascii=False)
    )


def generate_with_local_template(structured_analysis: dict[str, Any]) -> AIResult:
    title = str(structured_analysis.get("short_title") or "Análisis de sesión")
    message = str(
        structured_analysis.get("short_message")
        or "La sesión se ha analizado mediante las reglas internas de Aptus."
    )
    return AIResult(
        message=f"{title}. {message}",
        provider="rules",
        model=None,
        analysis_source="rules",
    )


def generate_local_fallback(structured_analysis: dict[str, Any]) -> AIResult:
    local = generate_with_local_template(structured_analysis)
    return AIResult(
        message=f"La IA no está disponible. {local.message}",
        provider="rules",
        model=None,
        analysis_source="local_fallback",
    )


def generate_with_openai(structured_analysis: dict[str, Any]) -> AIResult:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    model = configured_model("openai")
    if not api_key or not model:
        raise RuntimeError("OpenAI no está configurado en el servidor.")
    response = OpenAI(api_key=api_key).responses.create(
        model=model,
        instructions="Eres el redactor de Aptus. Las reglas ya han tomado las decisiones.",
        input=minimal_prompt(structured_analysis),
    )
    message = str(response.output_text or "").strip()
    if not message:
        raise RuntimeError("OpenAI no devolvió contenido.")
    return AIResult(message=message, provider="openai", model=model, analysis_source="ai")


def generate_with_gemini(structured_analysis: dict[str, Any]) -> AIResult:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    model = configured_model("gemini")
    if not api_key or not model:
        raise RuntimeError("Gemini no está configurado en el servidor.")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    with httpx.Client(timeout=25.0) as client:
        response = client.post(
            url,
            params={"key": api_key},
            json={"contents": [{"parts": [{"text": minimal_prompt(structured_analysis)}]}]},
        )
        response.raise_for_status()
    payload = response.json()
    candidates = payload.get("candidates") or []
    parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
    message = " ".join(str(part.get("text", "")).strip() for part in parts).strip()
    if not message:
        raise RuntimeError("Gemini no devolvió contenido.")
    return AIResult(message=message, provider="gemini", model=model, analysis_source="ai")


def generate_with_ollama(structured_analysis: dict[str, Any]) -> AIResult:
    base_url = os.getenv("OLLAMA_BASE_URL", "").strip().rstrip("/")
    model = configured_model("ollama")
    if not base_url or not model:
        raise RuntimeError("Ollama no está configurado en el servidor.")
    with httpx.Client(timeout=60.0) as client:
        response = client.post(
            f"{base_url}/api/generate",
            json={"model": model, "prompt": minimal_prompt(structured_analysis), "stream": False},
        )
        response.raise_for_status()
    message = str(response.json().get("response") or "").strip()
    if not message:
        raise RuntimeError("Ollama no devolvió contenido.")
    return AIResult(message=message, provider="ollama", model=model, analysis_source="ai")


def generate_coach_message(structured_analysis: dict[str, Any]) -> AIResult:
    provider = provider_name()
    generators = {
        "gemini": generate_with_gemini,
        "openai": generate_with_openai,
        "ollama": generate_with_ollama,
    }
    if provider in LOCAL_PROVIDERS:
        return generate_with_local_template(structured_analysis)
    generator = generators.get(provider)
    if generator is None:
        return generate_local_fallback(structured_analysis)
    try:
        return generator(structured_analysis)
    except Exception:
        logger.exception("AI provider failed; Aptus is using the local rules fallback.")
        return generate_local_fallback(structured_analysis)


def generateWithLocalTemplate(structuredAnalysis: dict[str, Any]) -> AIResult:
    return generate_with_local_template(structuredAnalysis)


def generateWithGemini(structuredAnalysis: dict[str, Any]) -> AIResult:
    return generate_with_gemini(structuredAnalysis)


def generateWithOpenAI(structuredAnalysis: dict[str, Any]) -> AIResult:
    return generate_with_openai(structuredAnalysis)


def generateWithOllama(structuredAnalysis: dict[str, Any]) -> AIResult:
    return generate_with_ollama(structuredAnalysis)


def generateCoachMessage(structuredAnalysis: dict[str, Any]) -> AIResult:
    """Common provider-neutral interface requested by Aptus."""
    return generate_coach_message(structuredAnalysis)


def check_connection() -> dict[str, Any]:
    status = configuration_status()
    if not status["enabled"]:
        return status
    provider = status["provider"]
    try:
        if provider == "openai":
            OpenAI(api_key=os.environ["OPENAI_API_KEY"]).models.list()
        elif provider == "gemini":
            with httpx.Client(timeout=15.0) as client:
                response = client.get(
                    "https://generativelanguage.googleapis.com/v1beta/models",
                    params={"key": os.environ["GEMINI_API_KEY"]},
                )
                response.raise_for_status()
        elif provider == "ollama":
            with httpx.Client(timeout=15.0) as client:
                response = client.get(
                    f"{os.environ['OLLAMA_BASE_URL'].rstrip('/')}/api/tags"
                )
                response.raise_for_status()
        return {**status, "status": "connected"}
    except Exception:
        logger.exception("AI connection check failed for provider %s.", provider)
        return {**status, "status": "error"}
