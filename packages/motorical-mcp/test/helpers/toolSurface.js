// Plain module (no node:test import) so both the test file and the fixture
// generator script can import it without executing a test suite as a side
// effect of the import.

/** The advertised surface of every registered tool, order-independent. */
export function toolSurface(server) {
  // The SDK keeps registered tools on the McpServer instance; read them rather
  // than re-deriving, so this reflects what a client would actually be told.
  const tools = server._registeredTools ?? {};
  return Object.entries(tools)
    .map(([name, t]) => ({
      name,
      description: t.description ?? null,
      inputKeys: Object.keys(t.inputSchema?.shape ?? {}).sort(),
      annotations: t.annotations ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
