
- NextJS + Typescript - react framework for routing and API
- gts (Google Typescript Style) - code formatting/linting
- Atlas - schema definition and migrations
- Kysely - type checking for SQL queries
- Vercel AI SDK - running LLM models
- trpc - type checking and input validation for (non-streamed) api routes


## Trade Offs

- TRPC works amazingly well when it comes to developer ergonomics but it adds
extra runtime overhead, especially when it comes to serverless deployments like what we have rn. All routers are deployed for all serverless functions instead of the regular one function mapping to one endpoint.

- Using the standard tool use schema limits it to models that do support it.

- There's a dependency on clerk for auth which is, again, very good for developer ergonomics but it adds extra cost and latency where there needs to be additional requests to the clerk servers for handling auth.

- This project does not use react server components even though there are places where it can do that and make UI loading significantly faster. This is just to save time.

- There's also no pagination in the docs API at the moment.

- If later the backend needs to be decoupled from the frontend, decoupling the TRPC backend would be very straightforward, decoupling the streaming endpoints would be need a significant rewrite of the endpoints and auth handling. We're sort of locked into nextjs' way of doing things.

- Shadcn uses Radix UI which is known to have been poorly maintained now but shadcn still remains one of the most used component libraries.
