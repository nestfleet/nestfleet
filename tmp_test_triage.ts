import { runTriageAgent } from "./src/agents/impl/triage.js"

const result = await runTriageAgent({
  productId: "docugardener",
  caseId: "test-case-1",
  jobId: "test-job-1",
  signalText:
    "I cannot export my documents as PDF. The export button is greyed out and nothing happens when I click it.",
})

console.log(JSON.stringify(result.output, null, 2))
