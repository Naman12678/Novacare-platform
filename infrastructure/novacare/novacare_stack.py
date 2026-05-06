"""
NovaCare v2.0 - Core Infrastructure Stack
Provisions the DynamoDB, ElastiCache (Redis), RDS (PostgreSQL), SQS, and Bedrock permissions
required for the NovaCare hybrid platform.
"""

from aws_cdk import (
    Stack,
    aws_dynamodb as dynamodb,
    aws_ec2 as ec2,
    aws_rds as rds,
    aws_elasticache as elasticache,
    aws_sqs as sqs,
    aws_iam as iam,
    aws_s3 as s3,
    aws_kms as kms,
    RemovalPolicy,
    Duration,
)
from constructs import Construct


class NovaCareStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # 1. Network setup (VPC)
        vpc = ec2.Vpc(
            self, "NovaCareVpc",
            max_azs=2,
            nat_gateways=1
        )

        # 2. KMS Key for data encryption
        kms_key = kms.Key(
            self, "NovaCareKmsKey",
            enable_key_rotation=True,
            alias="alias/novacare-production",
            removal_policy=RemovalPolicy.RETAIN
        )

        # 3. DynamoDB: Single-table design for Patient State and Events
        patient_state_table = dynamodb.Table(
            self, "NovaCarePatientState",
            table_name="novacare_patient_state",
            partition_key=dynamodb.Attribute(name="pk", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="sk", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption=dynamodb.TableEncryption.CUSTOMER_MANAGED,
            encryption_key=kms_key,
            removal_policy=RemovalPolicy.RETAIN,
            point_in_time_recovery=True,
        )

        # GSI: Hospital Active Patients
        patient_state_table.add_global_secondary_index(
            index_name="hospital_active_patients_index",
            partition_key=dynamodb.Attribute(name="hospital_id", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="discharge_date", type=dynamodb.AttributeType.STRING),
            projection_type=dynamodb.ProjectionType.ALL
        )

        # GSI: Risk Score Index
        patient_state_table.add_global_secondary_index(
            index_name="risk_score_index",
            partition_key=dynamodb.Attribute(name="risk_tier", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="risk_score", type=dynamodb.AttributeType.NUMBER),
            projection_type=dynamodb.ProjectionType.ALL
        )

        # 4. PostgreSQL (Amazon RDS) for relational data
        rds_instance = rds.DatabaseInstance(
            self, "NovaCareRDS",
            engine=rds.DatabaseInstanceEngine.postgres(version=rds.PostgresEngineVersion.VER_15),
            instance_type=ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM),
            vpc=vpc,
            vpc_subnets=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS),
            allocated_storage=50,
            max_allocated_storage=200,
            multi_az=True,
            storage_encrypted=True,
            storage_encryption_key=kms_key,
            database_name="novacare_db",
            credentials=rds.Credentials.from_generated_secret("novacare"),
            removal_policy=RemovalPolicy.SNAPSHOT,
            deletion_protection=True,
        )

        # 5. Redis (ElastiCache) for BullMQ tasks and caching
        redis_subnet_group = elasticache.CfnSubnetGroup(
            self, "NovaCareRedisSubnets",
            description="Subnets for NovaCare Redis cluster",
            subnet_ids=[subnet.subnet_id for subnet in vpc.private_subnets]
        )

        redis_cluster = elasticache.CfnCacheCluster(
            self, "NovaCareRedis",
            engine="redis",
            cache_node_type="cache.t4g.micro",
            num_cache_nodes=1,
            cache_subnet_group_name=redis_subnet_group.ref,
            vpc_security_group_ids=[
                vpc.vpc_default_security_group
            ]
        )

        # 6. SQS Dead-Letter Queues (fallback for failed BullMQ tasks/events)
        dlq = sqs.Queue(
            self, "NovaCareDLQ",
            queue_name="novacare-agent-dlq",
            retention_period=Duration.days(14),
            encryption=sqs.QueueEncryption.KMS,
            encryption_master_key=kms_key
        )

        # 7. S3 Buckets for artifacts
        model_artifacts_bucket = s3.Bucket(
            self, "NovaCareModelArtifacts",
            bucket_name="novacare-model-artifacts",
            encryption=s3.BucketEncryption.KMS,
            encryption_key=kms_key,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            versioned=True
        )

        fhir_archive_bucket = s3.Bucket(
            self, "NovaCareFhirArchive",
            bucket_name="novacare-fhir-archive",
            encryption=s3.BucketEncryption.KMS,
            encryption_key=kms_key,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            lifecycle_rules=[
                s3.LifecycleRule(
                    transitions=[s3.Transition(storage_class=s3.StorageClass.INTELLIGENT_TIERING, transition_after=Duration.days(30))]
                )
            ]
        )

        # 8. IAM Role for Agent Service Tasks (Bedrock Access)
        agent_role = iam.Role(
            self, "NovaCareAgentRole",
            assumed_by=iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
            description="Role for NovaCare Python Agent Service"
        )
        
        # Bedrock permissions
        agent_role.add_to_policy(iam.PolicyStatement(
            actions=["bedrock:InvokeModel"],
            resources=["*"] # Restrict to specific Claude/Nova models in production
        ))

        # DynamoDB permissions
        patient_state_table.grant_read_write_data(agent_role)
        
        # S3 permissions
        model_artifacts_bucket.grant_read(agent_role)


