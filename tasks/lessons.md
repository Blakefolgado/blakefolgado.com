# Lessons

- Confirm the actual hosting/deployment platform before wiring scheduled generation. Vercel-native scheduling should use a build artifact plus redeploy trigger instead of GitHub commit automation.
- When fixing LLM-generated markup bugs, tighten both the prompt and the validator. Sanitizing the output alone still lets invalid structures ship on the next generation.
