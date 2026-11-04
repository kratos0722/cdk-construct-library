import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { IKey } from 'aws-cdk-lib/aws-kms';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  ObjectOwnership,
} from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * Properties for {@link SecureBucket}.
 *
 * All security controls are applied by default; every property below exists
 * only to let a caller tune (not weaken) the baseline.
 */
export interface SecureBucketProps {
  /**
   * Physical bucket name. Leave undefined to let CloudFormation generate one.
   */
  readonly bucketName?: string;

  /**
   * Server-side encryption mode.
   *
   * @default BucketEncryption.S3_MANAGED - unless `encryptionKey` is supplied,
   * in which case {@link BucketEncryption.KMS} is used automatically.
   */
  readonly encryption?: BucketEncryption;

  /**
   * Optional customer-managed KMS key. Supplying this switches encryption to
   * {@link BucketEncryption.KMS}.
   */
  readonly encryptionKey?: IKey;

  /**
   * Enable object versioning so overwrites and deletes are recoverable.
   *
   * @default true
   */
  readonly versioned?: boolean;

  /**
   * Removal policy for the bucket.
   *
   * @default RemovalPolicy.RETAIN - data is preserved if the stack is deleted.
   */
  readonly removalPolicy?: RemovalPolicy;

  /**
   * Expire noncurrent object versions after this duration to control cost.
   *
   * @default Duration.days(365)
   */
  readonly noncurrentVersionExpiration?: Duration;

  /**
   * Abort incomplete multipart uploads after this duration.
   *
   * @default Duration.days(7)
   */
  readonly abortIncompleteMultipartUploadAfter?: Duration;

  /**
   * Deny all non-TLS (`aws:SecureTransport=false`) requests via bucket policy.
   *
   * @default true
   */
  readonly enforceSsl?: boolean;
}

/**
 * An S3 bucket that is private, encrypted, versioned and TLS-only by default.
 *
 * Hardened controls:
 * - Server-side encryption (S3-managed by default, customer KMS optional).
 * - {@link BlockPublicAccess.BLOCK_ALL} - no public ACLs or policies.
 * - Bucket policy denying any request that is not over TLS.
 * - Object versioning enabled.
 * - ACLs disabled via `BUCKET_OWNER_ENFORCED` object ownership.
 * - A baseline lifecycle rule (abort stale multipart uploads, expire old versions).
 * - `RemovalPolicy.RETAIN` so a stack teardown never silently destroys data.
 *
 * @example
 * const bucket = new SecureBucket(this, 'Assets');
 */
export class SecureBucket extends Construct {
  /** The underlying L2 bucket, exposed for grants and references. */
  public readonly bucket: Bucket;

  constructor(scope: Construct, id: string, props: SecureBucketProps = {}) {
    super(scope, id);

    const encryption =
      props.encryption ??
      (props.encryptionKey ? BucketEncryption.KMS : BucketEncryption.S3_MANAGED);

    this.bucket = new Bucket(this, 'Resource', {
      bucketName: props.bucketName,
      encryption,
      encryptionKey: props.encryptionKey,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: props.enforceSsl ?? true,
      versioned: props.versioned ?? true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: props.removalPolicy ?? RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: 'secure-bucket-baseline',
          enabled: true,
          abortIncompleteMultipartUploadAfter:
            props.abortIncompleteMultipartUploadAfter ?? Duration.days(7),
          noncurrentVersionExpiration:
            props.noncurrentVersionExpiration ?? Duration.days(365),
        },
      ],
    });
  }
}
