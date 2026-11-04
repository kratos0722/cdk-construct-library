import { RemovalPolicy } from 'aws-cdk-lib';
import {
  Attribute,
  BillingMode,
  Table,
  TableEncryption,
} from 'aws-cdk-lib/aws-dynamodb';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

/** Properties for {@link SecureTable}. */
export interface SecureTableProps {
  /** Partition key attribute. */
  readonly partitionKey: Attribute;

  /** Optional sort key attribute. */
  readonly sortKey?: Attribute;

  /** Explicit table name. Defaults to a generated name. */
  readonly tableName?: string;

  /**
   * Billing mode.
   *
   * @default BillingMode.PAY_PER_REQUEST - no capacity to over- or under-provision.
   */
  readonly billingMode?: BillingMode;

  /**
   * Encryption mode.
   *
   * @default TableEncryption.AWS_MANAGED - unless `encryptionKey` is supplied,
   * in which case {@link TableEncryption.CUSTOMER_MANAGED} is used.
   */
  readonly encryption?: TableEncryption;

  /** Optional customer-managed KMS key (switches to CUSTOMER_MANAGED encryption). */
  readonly encryptionKey?: IKey;

  /**
   * Enable point-in-time recovery (continuous backups).
   *
   * @default true
   */
  readonly pointInTimeRecovery?: boolean;

  /**
   * Removal policy.
   *
   * @default RemovalPolicy.RETAIN
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * A DynamoDB table that is encrypted, continuously backed up and retained by
 * default.
 *
 * Hardened controls:
 * - Server-side encryption with an AWS-managed KMS key (or a customer-managed
 *   key when supplied) rather than the AWS-owned default.
 * - Point-in-time recovery enabled.
 * - On-demand billing so there is no capacity to misconfigure.
 * - `RemovalPolicy.RETAIN` so a stack teardown never silently drops the table.
 *
 * @example
 * new SecureTable(this, 'Sessions', {
 *   partitionKey: { name: 'sessionId', type: AttributeType.STRING },
 * });
 */
export class SecureTable extends Construct {
  /** The underlying L2 table. */
  public readonly table: Table;

  constructor(scope: Construct, id: string, props: SecureTableProps) {
    super(scope, id);

    const encryption =
      props.encryption ??
      (props.encryptionKey
        ? TableEncryption.CUSTOMER_MANAGED
        : TableEncryption.AWS_MANAGED);

    this.table = new Table(this, 'Resource', {
      partitionKey: props.partitionKey,
      sortKey: props.sortKey,
      tableName: props.tableName,
      billingMode: props.billingMode ?? BillingMode.PAY_PER_REQUEST,
      encryption,
      encryptionKey: props.encryptionKey,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: props.pointInTimeRecovery ?? true,
      },
      removalPolicy: props.removalPolicy ?? RemovalPolicy.RETAIN,
    });
  }
}
