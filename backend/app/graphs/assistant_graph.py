from typing import TypedDict

from langgraph.graph import StateGraph, START, END

from app.agents.router_agent import RouterAgent
from app.agents.code_agent import CodeAgent
from app.agents.chat_agent import ChatAgent
from app.agents.critic_agent import CriticAgent
from app.agents.web_agent import WebAgent


class AssistantState(TypedDict):
    user_message: str
    conversation_context: str
    route: str
    agent_response: str
    final_response: str


def router_node(state: AssistantState):
    route = RouterAgent.route(state["user_message"])
    if "code" in route.lower():
        route = "code"
    elif "web" in route.lower():
        route = "web"
    else:
        route = "chat"
    return {"route": route}


def code_node(state: AssistantState):
    response = CodeAgent.handle(
        user_message=state["user_message"],
        conversation_context=state["conversation_context"]
    )
    return {"agent_response": response}


def chat_node(state: AssistantState):
    response = ChatAgent.handle(
        user_message=state["user_message"],
        conversation_context=state["conversation_context"]
    )
    return {"agent_response": response}


def web_node(state: AssistantState):
    response = WebAgent.handle(
        user_message=state["user_message"],
        conversation_context=state["conversation_context"]
    )
    return {"agent_response": response}


def critic_node(state: AssistantState):
    # Skip critic for web (already sourced) or short responses — saves ~1-2s
    if state["route"] == "web":
        return {"final_response": state["agent_response"]}
    if len(state["agent_response"]) < 200:
        return {"final_response": state["agent_response"]}
    final_response = CriticAgent.review(
        user_message=state["user_message"],
        agent_response=state["agent_response"]
    )
    return {"final_response": final_response}


def route_decision(state: AssistantState):
    return state["route"]


graph_builder = StateGraph(AssistantState)

graph_builder.add_node("router", router_node)
graph_builder.add_node("code_agent", code_node)
graph_builder.add_node("chat_agent", chat_node)
graph_builder.add_node("web_agent", web_node)
graph_builder.add_node("critic", critic_node)

graph_builder.add_edge(START, "router")

graph_builder.add_conditional_edges(
    "router",
    route_decision,
    {
        "code": "code_agent",
        "chat": "chat_agent",
        "web": "web_agent"
    }
)

graph_builder.add_edge("code_agent", "critic")
graph_builder.add_edge("chat_agent", "critic")
graph_builder.add_edge("web_agent", "critic")
graph_builder.add_edge("critic", END)

assistant_graph = graph_builder.compile()


def run_assistant_graph(user_message: str, conversation_context: str = ""):
    result = assistant_graph.invoke({
        "user_message": user_message,
        "conversation_context": conversation_context,
        "route": "",
        "agent_response": "",
        "final_response": ""
    })
    return result
