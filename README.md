# @pipeworx/uk-ons

UK Office for National Statistics MCP — UK official statistics. No auth.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

- `list_datasets(limit?, offset?)`
- `get_dataset(dataset_id)`
- `list_editions(dataset_id)`
- `get_version(dataset_id, edition, version)`
- `get_observations(dataset_id, edition, version, dimensions)`

## Data source

`https://api.beta.ons.gov.uk/v1/`

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "uk-ons": {
      "url": "https://gateway.pipeworx.io/uk-ons/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Uk Ons data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
