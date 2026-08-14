/**
 * Storage-domain spec for the cross-session global bill.
 *
 * The domain's single global record holds the running total; it is loaded at
 * open and rewritten on each change feed delta (debounced by the caller).
 *
 * @module dsh-cost-tracker/cost-domain
 */
/** The `cost_tracker` storage domain: one global record, no tables. */
export declare const costDomainSpec: {
    name: string;
    version: number;
    global: {
        schema: import("zod").ZodObject<{
            totalCost: import("zod").ZodNumber;
            peakCost: import("zod").ZodNumber;
            offpeakCost: import("zod").ZodNumber;
            callCount: import("zod").ZodNumber;
            unconfiguredCalls: import("zod").ZodNumber;
            unconfiguredModels: import("zod").ZodArray<import("zod").ZodString>;
            byModel: import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodObject<{
                inputHit: import("zod").ZodNumber;
                inputMiss: import("zod").ZodNumber;
                output: import("zod").ZodNumber;
                total: import("zod").ZodNumber;
            }, import("zod/v4/core").$strip>>;
            byWorkspace: import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodObject<{
                totalCost: import("zod").ZodNumber;
                peakCost: import("zod").ZodNumber;
                offpeakCost: import("zod").ZodNumber;
                callCount: import("zod").ZodNumber;
                unconfiguredCalls: import("zod").ZodNumber;
                unconfiguredModels: import("zod").ZodArray<import("zod").ZodString>;
                byModel: import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodObject<{
                    inputHit: import("zod").ZodNumber;
                    inputMiss: import("zod").ZodNumber;
                    output: import("zod").ZodNumber;
                    total: import("zod").ZodNumber;
                }, import("zod/v4/core").$strip>>;
            }, import("zod/v4/core").$strip>>;
        }, import("zod/v4/core").$strip>;
        initial: import("./billing.ts").GlobalBill;
    };
    tables: {};
};
//# sourceMappingURL=cost-domain.d.ts.map