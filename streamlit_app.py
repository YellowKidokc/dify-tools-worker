import streamlit as st
import requests

API_BASE = st.secrets.get("WORKER_URL", "http://localhost:8787")
TOKEN = st.secrets.get("TOKEN", "bananaiscool")

if "queries" not in st.session_state:
    st.session_state.queries = [""]

st.title("Quote then Run")

if st.button("Add Query"):
    st.session_state.queries.append("")

for i, _ in enumerate(st.session_state.queries):
    st.subheader(f"Query {i+1}")
    prompt_key = f"prompt_{i}"
    st.session_state.queries[i] = st.text_area("Prompt", st.session_state.queries[i], key=prompt_key)

    if st.button("Get Quote", key=f"quote_{i}"):
        r = requests.post(
            f"{API_BASE}/quote",
            headers={"Authorization": f"Bearer {TOKEN}"},
            json={
                "provider": "openai",
                "model": "gpt-4.1-mini",
                "prompt": st.session_state.queries[i],
            },
        )
        st.session_state[f"quote_{i}"] = r.json()

    q = st.session_state.get(f"quote_{i}")
    if q:
        st.json(q)
        if st.button("Confirm & Run", key=f"confirm_{i}"):
            r = requests.post(
                f"{API_BASE}/confirm",
                headers={"Authorization": f"Bearer {TOKEN}"},
                json={"quote_id": q.get("quote_id"), "accept": True},
            )
            st.session_state[f"resp_{i}"] = r.json()

    resp = st.session_state.get(f"resp_{i}")
    if resp:
        st.write(resp.get("answer", ""))
        st.caption(f"Cost: ${resp.get('actual_cost_usd', 0)}")
