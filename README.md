# secure-cdk-constructs

A self-service library of **secure-by-default** AWS CDK v2 (TypeScript) constructs.
Product teams drop them into a stack and inherit least-privilege IAM and hardened
configuration as the *starting point* — not something to be bolted on during a
pre-launch security review.

> **NDA-safe / portfolio note:** every identifier, CIDR and example value in this
> repository is invented. There are no real account IDs, ARNs or customer details.

---

## The problem

On most teams, every new service re-implements the same security plumbing by hand:

- Someone wires up logging, picks a retention, and usually forgets to set one at all.
- Someone writes an IAM role and, under deadline, reaches for `Action: "*"` on
  `Resource: "*"` "just to unblock the demo."
- Someone creates an S3 bucket and leaves public access, TLS enforcement and
  versioning to chance.
- Someone stands up a VPC with no flow logs and no private subnet tiers.

The result is drift: 20 services, 20 slightly different (and slightly wrong)
security postures. When a standard changes, it has to be chased across every repo.

## The approach: secure defaults travel *with* the construct

This library inverts the default. Each construct ships with the hardened
configuration already applied, exposed through a small, documented props
interface that lets callers *tune* the baseline — not silently weaken it.

Because the defaults live inside the construct, a platform-wide change (say, a new
mandatory retention or a tighter lifecycle rule) lands in **one place** and every
consumer inherits it on their next `cdk deploy`.

## Constructs

| Construct             | AWS resource        | What it hardens by default |
|-----------------------|---------------------|-----------------------------|
| **`SecureBucket`**        | S3 bucket           | SSE encryption (S3-managed, optional KMS), `BLOCK_ALL` public access, TLS-only bucket policy, versioning, ACLs disabled, a baseline lifecycle rule, `RETAIN` removal policy. |
| **`StructuredLogGroup`**  | CloudWatch Logs     | Explicit retention (30 days) instead of "never expire", `RETAIN` removal, and a `formatLogRecord()` helper for consistent JSON logging. |
| **`SecureFunction`**      | Lambda function     | Active X-Ray tracing, a purpose-built least-privilege execution role (no `*:*`), a dedicated `StructuredLogGroup`, KMS-encrypted environment variables, conservative memory/timeout. |
| **`StandardVpc`**         | VPC                 | Private-isolated **and** private-with-egress subnet tiers, S3 + DynamoDB gateway VPC endpoints, and VPC flow logs to a retained log group. |
| **`SecureTable`**         | DynamoDB table      | KMS server-side encryption, point-in-time recovery, on-demand billing, `RETAIN` removal policy. |
| **`SecureQueue`**         | SQS queue           | Server-side encryption (SSE-SQS default, optional KMS), TLS-only queue policy, an encrypted dead-letter queue with a bounded `maxReceiveCount`, `RETAIN` removal policy. |

Every secure default above is overridable through the construct's props.

## Usage

```ts
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Code, Runtime } from 'aws-cdk-lib/aws-lambda';
import { AttributeType } from 'aws-cdk-lib/aws-dynamodb';
import {
  SecureBucket,
  SecureFunction,
  SecureTable,
  StandardVpc,
} from '@clarence-averion/secure-cdk-constructs';

export class AppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const network = new StandardVpc(this, 'Network');

    const bucket = new SecureBucket(this, 'Assets');

    const table = new SecureTable(this, 'Sessions', {
      partitionKey: { name: 'sessionId', type: AttributeType.STRING },
    });

    const api = new SecureFunction(this, 'Api', {
      handler: 'index.handler',
      code: Code.fromAsset('lambda'),
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(15),
      environment: { TABLE_NAME: table.table.tableName },
    });

    // Resource-scoped, least-privilege grants — no wildcards.
    bucket.bucket.grantReadWrite(api.function);
    table.table.grantReadWriteData(api.function);
  }
}
```

A complete, runnable composition lives in
[`examples/example-stack.ts`](examples/example-stack.ts) (`PlatformBaselineStack`),
which is also exercised by the integration test.

## Structured logging convention

`SecureFunction` provisions a `StructuredLogGroup`. Application code can emit the
library's standard JSON shape with the bundled helper:

```ts
import { StructuredLogGroup } from '@clarence-averion/secure-cdk-constructs';

console.log(
  StructuredLogGroup.formatLogRecord({
    level: 'INFO',
    message: 'order accepted',
    service: 'checkout',
    correlationId: event.requestId,
  }),
);
// => {"timestamp":"2026-...Z","level":"INFO","message":"order accepted",...}
```

## Build & test

The test suite synthesizes each construct into a CloudFormation template using
`aws-cdk-lib/assertions` and asserts the hardened properties. **It is synth-only
and needs no AWS account or credentials.**

```bash
npm install
npm run build   # tsc -> dist/
npm test        # jest + aws-cdk-lib/assertions
```

What the tests assert (a sample):

- S3 `BucketEncryption`, `VersioningConfiguration: { Status: 'Enabled' }`, and a
  bucket policy that denies `aws:SecureTransport=false`.
- Lambda `TracingConfig: { Mode: 'Active' }` and an execution role carrying **no**
  policy with `Action: "*"` on `Resource: "*"`.
- `RetentionInDays` on log groups.
- Both S3 and DynamoDB gateway VPC endpoints plus a VPC flow log.
- DynamoDB `SSESpecification` and `PointInTimeRecoverySpecification`.

## Requirements

- Node.js >= 20
- `aws-cdk-lib` ^2.275.0 and `constructs` ^10.5.0 (declared as peer dependencies)

## Project layout

```
src/        construct implementations (one per file)
test/       jest synth-assertion suites + shared helpers
examples/   PlatformBaselineStack composing every construct
```
