---
name: give-claude-access-to-docs
description: "Enable Claude to access your documentation through MCP to enhance AI responsiveness."
---

## When to use
Use this skill when you want Claude to access your private documentation through a hosted MCP server to enhance its responsiveness and accuracy when answering questions related to your product or services.

## Steps
1. **Open MCP Studio**: Launch the MCP Studio to start creating your documentation server.

2. **Create a Server**:
   - **Name the Server**: Choose a name that reflects what this documentation is for, e.g., `Payments help center`.
   - **Add Documentation URL**: Enter the section of your site that contains the documentation. It is recommended to use a specific section rather than the entire domain. Ensure that the URL points to a source that can be indexed up to 5,000 pages.
   - **Choose Search Tools**: Select "search and question answering". If your documentation includes an API reference, also add "API reference lookup".
   - **Deploy the Server**: Click on deploy to start the indexing process.
   - **Set to Private if Necessary**: If your documentation is confidential, make the server private, which requires an access token for every request. Treat this token like a password.

3. **Copy the Server URL**: After deployment, copy the generated server URL, which will look like this:
   ```
   https://appatools.com/mcp-studio/api/mcp/your-server-name
   ```

4. **Add the Connector in Claude**:
   - Open Claude. Click the `+` button, then select *Connectors*.
   - Click *Add connector*, then select *Add custom connector*.
   - Enter a recognizable Name for the connector, and paste the MCP server URL you copied earlier.
   - If your server is private, you will need to add the access token in Claude's connector settings. Treat the token like a password and only share it with people who should access the documents.
   - Click *Continue*.

5. **Enable the Connector**:
   - Back in the chat window, open *Connectors* and toggle this connector on. 
   - If you are on a Team or Enterprise plan, make sure an Owner adds the connector first, and then other team members can click *Connect* on it afterwards.

## Gotchas
- **Connector Activation**: The connector needs to be turned on for each chat; it does not stay active by default across sessions.
- **Indexing Time**: If your documentation site is large, give it sufficient time to finish indexing before evaluating the responses from Claude.
- **Limitation on Free Plans**: The Free plan can only hold one custom connector.

## Check your work
- **Confirm Responses**: Ask Claude a specific question related to your documentation, like "How to rotate a key without dropping webhooks?" The response should reference the 24-hour overlap and cite "Settings → Developers."
- **Look for Connector Activity**: Verify that the response includes references or citations to the documentation. In most chats, there will be a tool call alongside the replies indicating that the connector is active.
- **Test Edge Cases**: Ask a question that isn’t covered in your documentation. For example, "What is our incident escalation policy?" If Claude indicates that the content isn't available and details the closest material, it confirms that the connector is functional but may need additional documentation added.

## Additional Notes
- Make sure to rephrase your questions in the terms used in your documentation to help Claude find the right page. If the reply is not what you expected, confirm the toggle is on for this chat, confirm indexing has finished on the dashboard, and rephrase the question in the wording the help center uses.
- If Claude does not list the connector at all, work through troubleshooting steps to ensure it appears.

## Sources

- https://appatools.com/mcp-studio/blog/how-to-give-claude-access-to-your-documentation-with-mcp
