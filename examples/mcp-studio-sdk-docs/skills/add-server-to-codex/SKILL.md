---
name: add-server-to-codex
description: "Connect an MCP server to Codex to enable AI assistance for your codebase."
---

## When to use
Use this skill when you need to connect an MCP server to Codex to enable AI assistance for your codebase. This includes when you want Codex to leverage your documentation, GitHub repository, or other files without needing to input code directly.

## Steps
1. **Build the Server in MCP Studio**
   - Open the MCP Studio wizard.
   - Name your server (e.g., `Harborline brand`).
   - Add your source (e.g., paste a documentation URL, upload files, etc.).
   - Choose at least three tools (e.g., `search_docs`, `ask_question`).
   - Deploy the server and copy the generated server URL (format: `https://appatools.com/mcp-studio/api/mcp/your-server-name`).

2. **Add the Server to Codex**
   - You can use any of the following surfaces (ChatGPT desktop app, Codex CLI, IDE extension) to add the server:
   
   **In the ChatGPT Desktop App:**
   - Open Settings, then select MCP servers.
   - Select Add server.
   - Enter a name, choose Streamable HTTP, and paste the server URL.
   - Save the server and select Restart.
   
   **In the Codex CLI:**
   ```bash
   codex mcp add harborline --url https://appatools.com/mcp-studio/api/mcp/your-server-name
   ```
   Just replace `https://appatools.com/mcp-studio/api/mcp/your-server-name` with the actual URL of your deployed Harborline MCP server.

   **In the IDE Extension:**
   - Open the gear menu, select MCP servers, click Add server, and fill in the same name and URL. Save and select Restart extension.
   
   **Direct Edit in `config.toml`:**
   - You can manually add the server in `~/.codex/config.toml`:
   ```toml
   [mcp_servers.harborline]
   url = "https://appatools.com/mcp-studio/api/mcp/your-server-name"
   ```

3. **Connect a Private Server (if needed)**
   - If your material is confidential, make the server private in MCP Studio and create an access token starting with `mcps_live_`.
   - Add the bearer token configuration in `~/.codex/config.toml`:
   ```toml
   [mcp_servers.harborline]
   url = "https://appatools.com/mcp-studio/api/mcp/your-server-name"
   bearer_token_env_var = "HARBORLINE_MCP_TOKEN"
   ```
   - Set the `HARBORLINE_MCP_TOKEN` in the environment from which Codex starts. `bearer_token_env_var` takes the variable's name, never the token itself.

   Optionally, you can also send the header directly instead:
   ```toml
   [mcp_servers.harborline]
   url = "https://appatools.com/mcp-studio/api/mcp/your-server-name"
   http_headers = { "Authorization" = "Bearer mcps_live_your_token" }
   ```

4. **Start a New Session and Confirm Connection**
   - Start a new session in Codex.
   - Type `/mcp` to check that your server appears with its tools listed.

5. **Ask a Question to Test**
   - Ask a known question, for example, "Give me a two sentence elevator pitch for my company using the Harborline MCP server."
   - Then, ask a question not covered, like "What is Harborline's parental leave policy?" to verify that Codex responds correctly with appropriate messages. When nothing in your content is a real match, the server should communicate that it does not have information on that topic, ensuring proper filtering is in place.

## Gotchas
- The server's URL must contain `/api/mcp/`. If it doesn’t, Codex won't recognize it.
- If using private servers, ensure the bearer token is configured correctly as either an environment variable or in `http_headers`. A common error arises when the variable is named incorrectly or set to the token itself instead of the variable name.
- The ChatGPT desktop app may not recognize environment variables set in your terminal profile; thus, ensure you handle authorization properly, particularly if using private servers.
- Codex connects to its servers upon a new session start, so it won't recognize newly added servers if you just restart the existing session.
- If tools do not load or answers are thin, check if the server is still indexing or if your questions are phrased differently than expected.

## Check your work
- After adding the server, confirm it works by starting a new session and typing `/mcp`. Your server should appear with its tools.
- Check that you can receive accurate answers from Codex, especially for questions you know the answers to based on the server’s content.
- If you ask a question not covered by your source material, Codex should state that it does not have information on that topic, indicating proper filtering is in place.

## Sources

- https://appatools.com/mcp-studio/blog/how-to-connect-an-mcp-server-to-codex
