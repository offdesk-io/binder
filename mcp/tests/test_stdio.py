"""The server as the core starts it: `python -m binder_mcp` on stdio."""

import sys

import pytest
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

pytestmark = pytest.mark.anyio


async def test_it_starts_on_stdio_and_lists_its_tools():
    params = StdioServerParameters(command=sys.executable, args=["-m", "binder_mcp"],
                                   env={"BINDER_URL": "http://127.0.0.1:9"})
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = (await session.list_tools()).tools
            assert {t.name for t in tools} == {"find", "org", "pipeline", "people", "ref", "log", "next_step", "move"}
            r = await session.call_tool("find", {"query": "acme"}, meta={"offdesk/token": "a.b"})
            assert r.is_error and "Binder did not answer" in r.content[0].text
