# ============================================================
# NovaCare v2.0 — LangGraph Master Graph
# Wires all 6 agents with conditional routing
# ============================================================

from langgraph.graph import StateGraph, END
from novacare.orchestrator.state import NovaCareState
from novacare.agents.discharge_architect import discharge_architect_node
from novacare.agents.daily_pulse import daily_pulse_node
from novacare.agents.risk_orchestrator import risk_orchestrator_node
from novacare.agents.pharmacy_bridge import pharmacy_bridge_node
from novacare.agents.family_network import family_network_node
from novacare.agents.outcomes_learning import outcomes_learning_node
import structlog

logger = structlog.get_logger(__name__)


def route_after_pulse(state: NovaCareState) -> str:
    """Conditional routing after daily pulse completes."""
    # Day 30 → outcomes check
    if state["current_day"] >= 30:
        return "day_30"

    # Medication non-adherence for 2+ days → pharmacy bridge THEN risk check
    # FIXED: Pharmacy route now goes to risk check instead of END
    if state["med_adherence_streak"] == 0 and state["current_day"] > 1:
        return "pharmacy"

    # Always check risk after pulse
    return "risk_check"


def route_after_risk(state: NovaCareState) -> str:
    """Route based on risk tier after risk assessment."""
    if state["risk_tier"] in ("ORANGE", "RED"):
        return "family_alert"
    return "end"


def build_novacare_graph() -> StateGraph:
    """Build the master NovaCare LangGraph workflow."""

    graph = StateGraph(NovaCareState)

    # Add nodes (one per agent)
    graph.add_node("discharge_architect", discharge_architect_node)
    graph.add_node("daily_pulse", daily_pulse_node)
    graph.add_node("risk_orchestrator", risk_orchestrator_node)
    graph.add_node("pharmacy_bridge", pharmacy_bridge_node)
    graph.add_node("family_network", family_network_node)
    graph.add_node("outcomes_learning", outcomes_learning_node)

    # Entry point
    graph.set_entry_point("discharge_architect")

    # Discharge → Daily Pulse (for subsequent runs)
    graph.add_edge("discharge_architect", END)

    # Conditional routing from daily pulse
    graph.add_conditional_edges("daily_pulse", route_after_pulse, {
        "risk_check": "risk_orchestrator",
        "pharmacy": "pharmacy_bridge",
        "day_30": "outcomes_learning",
    })

    # FIXED: Pharmacy bridge now routes to risk check instead of END
    graph.add_edge("pharmacy_bridge", "risk_orchestrator")

    # Risk orchestrator → conditional family alert
    graph.add_conditional_edges("risk_orchestrator", route_after_risk, {
        "family_alert": "family_network",
        "end": END,
    })

    # Terminal edges
    graph.add_edge("family_network", END)
    graph.add_edge("outcomes_learning", END)

    logger.info("novacare_graph_built", nodes=6)
    return graph


# Compiled graph singleton
novacare_graph = build_novacare_graph().compile()
