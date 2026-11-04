import { RemovalPolicy } from 'aws-cdk-lib';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

/** Severity levels for the standard structured log convention. */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/**
 * The canonical fields every structured log line should carry. Additional
 * arbitrary fields are allowed and preserved.
 */
export interface StructuredLogFields {
  readonly level: LogLevel;
  readonly message: string;
  readonly service?: string;
  readonly correlationId?: string;
  readonly [key: string]: unknown;
}

/** Properties for {@link StructuredLogGroup}. */
export interface StructuredLogGroupProps {
  /** Explicit log group name. Defaults to a generated name. */
  readonly logGroupName?: string;

  /**
   * How long log events are retained.
   *
   * @default RetentionDays.ONE_MONTH (30 days)
   */
  readonly retention?: RetentionDays;

  /**
   * Removal policy for the log group itself.
   *
   * @default RemovalPolicy.RETAIN
   */
  readonly removalPolicy?: RemovalPolicy;

  /** Optional customer-managed KMS key for log encryption at rest. */
  readonly encryptionKey?: IKey;
}

/**
 * A CloudWatch log group with an explicit, non-infinite retention and a
 * documented structured-logging convention.
 *
 * The AWS default for a raw log group is "never expire", which quietly grows
 * cost and widens the data-retention blast radius. This construct forces an
 * explicit retention (30 days by default) and provides
 * {@link StructuredLogGroup.formatLogRecord} so applications emit consistent,
 * queryable JSON lines.
 *
 * @example
 * const logs = new StructuredLogGroup(this, 'ApiLogs', {
 *   retention: RetentionDays.THREE_MONTHS,
 * });
 * console.log(StructuredLogGroup.formatLogRecord({ level: 'INFO', message: 'started' }));
 */
export class StructuredLogGroup extends Construct {
  /** Default retention applied when the caller does not specify one. */
  public static readonly DEFAULT_RETENTION = RetentionDays.ONE_MONTH;

  /**
   * Render a log record following the library's standard JSON convention:
   * an ISO-8601 `timestamp`, a `level`, a `message`, and any extra fields.
   *
   * This is a runtime helper intended to be imported into application/Lambda
   * code so every service logs in the same shape.
   */
  public static formatLogRecord(fields: StructuredLogFields): string {
    const { level, message, ...rest } = fields;
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...rest,
    });
  }

  /** The underlying L2 log group. */
  public readonly logGroup: LogGroup;

  /** The effective retention applied to the log group. */
  public readonly retention: RetentionDays;

  constructor(scope: Construct, id: string, props: StructuredLogGroupProps = {}) {
    super(scope, id);

    this.retention = props.retention ?? StructuredLogGroup.DEFAULT_RETENTION;

    this.logGroup = new LogGroup(this, 'Resource', {
      logGroupName: props.logGroupName,
      retention: this.retention,
      removalPolicy: props.removalPolicy ?? RemovalPolicy.RETAIN,
      encryptionKey: props.encryptionKey,
    });
  }

  /** Convenience accessor for the log group name. */
  public get logGroupName(): string {
    return this.logGroup.logGroupName;
  }

  /** Convenience accessor for the log group ARN. */
  public get logGroupArn(): string {
    return this.logGroup.logGroupArn;
  }
}
