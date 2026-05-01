export class AgentRunTicketNotFoundError extends Error {
  constructor() {
    super("Ticket not found.");
    this.name = "AgentRunTicketNotFoundError";
  }
}

export class AgentRunInvalidOutputError extends Error {
  constructor() {
    super("Invalid agent output.");
    this.name = "AgentRunInvalidOutputError";
  }
}
