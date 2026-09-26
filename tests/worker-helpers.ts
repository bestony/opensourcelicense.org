import { buildSystemPrompt } from "../worker/prompt";
import { realRaw } from "./helpers";

export const buildPrompt = () => buildSystemPrompt(realRaw());
