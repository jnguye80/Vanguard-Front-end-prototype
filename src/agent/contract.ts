// The lightweight Q&A contract between the channel (Amazon Connect chat or voice) and the grants agent.
// A starting point for the integration discussion: the request the channel sends for each question, and
// the response it gets back. Field names are proposals, not an agreed API.

import type { Exchange } from './types';

/** The lightweight Q&A contract: what the channel sends the agent, and what comes back. */
export function contract(e: Exchange) {
  return {
    request: {
      channel: e.channel,
      session: {
        authenticated: e.authentication.status === 'verified',
        // verified: own grants · guest: chose not to verify, general info only · locked: failed 3 times, general info only · none: not yet
        level: e.authentication.status === 'verified' ? 'verified' : e.authentication.status === 'guest' ? 'guest' : e.authentication.status === 'locked' ? 'locked' : 'none',
        method: e.channel === 'chat' ? 'donor_id' : 'donor_id+pin',
        donor_id: e.authentication.status === 'verified' ? e.authentication.donorId : null,
      },
      question: e.question,
      pii_removed: e.piiRemoved,
    },
    response: {
      outcome: e.outcome,
      answer: e.answer,
      authorization: { decision: e.authorization.status, reason: e.authorization.detail },
      routing: e.routing ? { agent: e.routing.agent, toolset: e.routing.toolset ?? null, intent: e.routing.intent } : null,
      tools_called: e.tools,
      sources: e.sources,
      handoff: e.handoff ? { case_id: e.handoff.caseId, team: e.handoff.team, reply_within_hours: e.handoff.responseHours, mode: e.handoff.mode } : null,
    },
  };
}

