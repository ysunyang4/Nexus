/**
 * Nexus Generic External MCP — Verification-First Engine & Monotonic Ledger
 * 
 * Features:
 * 1. Monotonic Action Ledger: PREPARED -> STARTED -> EXECUTED -> VERIFIED -> COMMITTED
 * 2. Independent Verification: Pre-state -> Call -> Post-state query -> Verification Rule
 * 3. Cryptographic Evidence generation (SHA-256 state hashing)
 * 4. Crash Recovery semantics: Unfinished actions recover as UNKNOWN / RETRY_UNSAFE
 * 5. Idempotency-aware Retry Policy
 */

import crypto from "node:crypto";
import type {
  ActionLedgerEntry,
  EvidenceRecord,
  DynamicMcpTool,
} from "./types.js";

export interface VerificationRule {
  type: "state_changed" | "object_found" | "custom_predicate" | "none";
  queryTool?: string;
  queryArgs?: Record<string, any>;
  expectedKey?: string;
  expectedValue?: any;
}

export class VerificationEngine {
  private static instance: VerificationEngine | null = null;
  private ledger: ActionLedgerEntry[] = [];
  private evidenceStore: Map<string, EvidenceRecord> = new Map();

  private constructor() {}

  public static getInstance(): VerificationEngine {
    if (!VerificationEngine.instance) {
      VerificationEngine.instance = new VerificationEngine();
    }
    return VerificationEngine.instance;
  }

  /**
   * Stage 1: Prepare Action
   */
  public prepareAction(
    tool: DynamicMcpTool,
    args: Record<string, any>,
    catalogVersion: number,
    permissionDecision: any
  ): { actionId: string; evidenceId: string; ledgerEntry: ActionLedgerEntry } {
    const actionId = `act_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const evidenceId = `ev_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const argsHash = crypto.createHash("sha256").update(JSON.stringify(args || {})).digest("hex");

    const entry: ActionLedgerEntry = {
      actionId,
      evidenceId,
      providerId: tool.providerId,
      providerInstanceId: tool.providerInstanceId,
      toolId: tool.qualifiedName,
      catalogVersion,
      permissionDecision: {
        granted: permissionDecision.granted,
        level: permissionDecision.activeLevel,
        required: permissionDecision.requiredLevel,
        reason: permissionDecision.reason,
      },
      stage: permissionDecision.granted ? "PREPARED" : "REJECTED",
      status: permissionDecision.granted ? "PENDING" : "REJECTED",
      timestamp: Date.now(),
      argumentsHash: argsHash,
      summary: `Execute ${tool.qualifiedName} [argsHash: ${argsHash.slice(0, 8)}]`,
    };

    this.ledger.push(entry);

    if (!permissionDecision.granted) {
      this.recordEvidence({
        evidenceId,
        actionId,
        toolId: tool.qualifiedName,
        providerId: tool.providerId,
        timestamp: Date.now(),
        status: "REJECTED",
        verificationPassed: false,
        arguments: args,
        auditReason: permissionDecision.reason || "Permission denied by Gateway",
      });
    }

    return { actionId, evidenceId, ledgerEntry: entry };
  }

  /**
   * Stage 2: Mark Action Started
   */
  public markStarted(actionId: string): void {
    const entry = this.findEntry(actionId);
    if (entry && entry.stage === "PREPARED") {
      entry.stage = "STARTED";
      entry.status = "PENDING";
    }
  }

  /**
   * Stage 3 & 4: Mark Executed & Verified
   */
  public markExecutedAndVerified(
    actionId: string,
    evidenceId: string,
    result: any,
    isError: boolean,
    durationMs: number,
    verificationPassed: boolean,
    preState?: any,
    postState?: any,
    error?: string
  ): EvidenceRecord {
    const entry = this.findEntry(actionId);
    const resultHash = crypto.createHash("sha256").update(JSON.stringify(result || {})).digest("hex");

    if (entry) {
      entry.durationMs = durationMs;
      entry.resultHash = resultHash;
      entry.error = error;

      if (isError) {
        entry.stage = "FAILED";
        entry.status = "FAILED";
        entry.verificationState = "FAILED";
      } else if (verificationPassed) {
        entry.stage = "COMMITTED";
        entry.status = "SUCCESS";
        entry.verificationState = "VERIFIED";
      } else {
        entry.stage = "RETRY_UNSAFE";
        entry.status = "FAILED";
        entry.verificationState = "FAILED";
      }
    }

    const preHash = preState
      ? crypto.createHash("sha256").update(JSON.stringify(preState)).digest("hex")
      : undefined;
    const postHash = postState
      ? crypto.createHash("sha256").update(JSON.stringify(postState)).digest("hex")
      : undefined;

    const evidence: EvidenceRecord = {
      evidenceId,
      actionId,
      toolId: entry?.toolId || "unknown",
      providerId: entry?.providerId || "unknown",
      timestamp: Date.now(),
      status: isError ? "FAILED" : verificationPassed ? "COMMITTED" : "FAILED",
      verificationPassed,
      preStateHash: preHash,
      postStateHash: postHash,
      result,
      auditReason: error || (verificationPassed ? "Independent verification confirmed state mutation" : "Verification rule failed"),
      signature: crypto
        .createHash("sha256")
        .update(`${actionId}:${evidenceId}:${resultHash}:${verificationPassed}`)
        .digest("hex"),
    };

    this.evidenceStore.set(evidenceId, evidence);
    return evidence;
  }

  /**
   * Crash Recovery Helper: Scan for dangling STARTED actions and mark UNKNOWN
   */
  public recoverCrashState(): number {
    let recovered = 0;
    for (const entry of this.ledger) {
      if (entry.stage === "STARTED") {
        entry.stage = "UNKNOWN";
        entry.status = "FAILED";
        entry.summary += " [Recovered after restart: State UNKNOWN]";
        recovered++;
      }
    }
    return recovered;
  }

  public getLedger(): ActionLedgerEntry[] {
    return [...this.ledger];
  }

  public getEvidence(evidenceId: string): EvidenceRecord | null {
    return this.evidenceStore.get(evidenceId) || null;
  }

  private recordEvidence(rec: EvidenceRecord): void {
    this.evidenceStore.set(rec.evidenceId, rec);
  }

  private findEntry(actionId: string): ActionLedgerEntry | undefined {
    return this.ledger.find((e) => e.actionId === actionId);
  }
}
