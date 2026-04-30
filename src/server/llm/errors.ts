export class DailyQuotaExceededError extends Error {
  userId: string;
  projectId: string;
  reason: string;

  constructor(args: { userId: string; projectId: string; reason: string }) {
    super(args.reason);
    this.name = "DailyQuotaExceededError";
    this.userId = args.userId;
    this.projectId = args.projectId;
    this.reason = args.reason;
  }
}
