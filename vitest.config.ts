import {defineConfig} from "vitest/config";
export default defineConfig({test:{include:["tests/**/*.test.ts"],coverage:{provider:"v8",reporter:["text","lcov"],include:["lib/contracts.ts"],thresholds:{lines:85,functions:90,statements:85,branches:80}}}});
