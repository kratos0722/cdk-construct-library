import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

/**
 * Properties for {@link SecureQueue}.
 *
 * Security controls are on by default; every property exists only to tune
 * (not weaken) the baseline.
 */
export interface SecureQueueProps {
  /** Physical queue name. Leave undefined for a generated name. */
  readonly queueName?: string;

  /**
   * Server-side encryption mode.
   *
   * @default QueueEncryption.SQS_MANAGED - unless `encryptionKey` is supplied,
   * in which case {@link QueueEncryption.KMS} is used automatically.
   */
  readonly encryption?: QueueEncryption;

  /** Optional customer-managed KMS key. Supplying it switches to KMS. */
  readonly encryptionKey?: IKey;

  /**
   * Deny any request that is not over TLS (`aws:SecureTransport=false`) via a
   * queue policy.
   *
   * @default true
   */
  readonly enforceSsl?: boolean;

  /**
   * Attach an (encrypted) dead-letter queue so poison messages are captured
   * rather than retried forever.
   *
   * @default true
   */
  readonly deadLetterQueue?: boolean;

  /**
   * Deliveries before a message is moved to the dead-letter queue.
   *
   * @default 5
   */
  readonly maxReceiveCount?: number;

  /** Visibility timeout for in-flight messages. @default Duration.seconds(30) */
  readonly visibilityTimeout?: Duration;

  /** How long messages are retained. @default Duration.days(14) */
  readonly retentionPeriod?: Duration;

  /** Removal policy for the queue(s). @default RemovalPolicy.RETAIN */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * An SQS queue that is encrypted and TLS-only by default, with an encrypted
 * dead-letter queue for poison messages.
 *
 * Hardened controls:
 * - Server-side encryption (SSE-SQS by default, customer KMS optional).
 * - Queue policy denying any non-TLS request.
 * - An encrypted dead-letter queue with a bounded `maxReceiveCount`.
 * - `RemovalPolicy.RETAIN` so a stack teardown never silently drops messages.
 *
 * @example
 * const queue = new SecureQueue(this, 'Jobs');
 */
export class SecureQueue extends Construct {
  /** The primary queue, exposed for grants and references. */
  public readonly queue: Queue;

  /** The dead-letter queue, unless disabled via props. */
  public readonly deadLetterQueue?: Queue;

  constructor(scope: Construct, id: string, props: SecureQueueProps = {}) {
    super(scope, id);

    const encryption =
      props.encryption ??
      (props.encryptionKey ? QueueEncryption.KMS : QueueEncryption.SQS_MANAGED);
    const enforceSSL = props.enforceSsl ?? true;
    const removalPolicy = props.removalPolicy ?? RemovalPolicy.RETAIN;
    const retentionPeriod = props.retentionPeriod ?? Duration.days(14);

    if (props.deadLetterQueue ?? true) {
      this.deadLetterQueue = new Queue(this, 'Dlq', {
        encryption,
        encryptionMasterKey: props.encryptionKey,
        enforceSSL,
        retentionPeriod: Duration.days(14),
      });
      this.deadLetterQueue.applyRemovalPolicy(removalPolicy);
    }

    this.queue = new Queue(this, 'Resource', {
      queueName: props.queueName,
      encryption,
      encryptionMasterKey: props.encryptionKey,
      enforceSSL,
      visibilityTimeout: props.visibilityTimeout ?? Duration.seconds(30),
      retentionPeriod,
      deadLetterQueue: this.deadLetterQueue
        ? { queue: this.deadLetterQueue, maxReceiveCount: props.maxReceiveCount ?? 5 }
        : undefined,
    });
    this.queue.applyRemovalPolicy(removalPolicy);
  }
}
