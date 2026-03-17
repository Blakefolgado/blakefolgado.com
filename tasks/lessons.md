# Lessons

- Confirm the actual hosting/deployment platform before wiring scheduled generation. Vercel-native scheduling should use a build artifact plus redeploy trigger instead of GitHub commit automation.
- When fixing LLM-generated markup bugs, tighten both the prompt and the validator. Sanitizing the output alone still lets invalid structures ship on the next generation.
- Before relinking or deploying a Vercel project, list existing projects and match the exact intended project name first. Similar project names can silently send production traffic to the wrong project.
- Validate the fully rendered document, not just the fragment. A clean fragment can still become invalid HTML if extracted CSS is reinserted with wrapper tags or unresolved placeholders survive token replacement.
