-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WaqfClassification" AS ENUM ('LARGE', 'MEDIUM', 'SMALL', 'DIRECT_UTILIZATION');

-- CreateEnum
CREATE TYPE "WaqfType" AS ENUM ('PUBLIC_CHARITABLE', 'FAMILY_DHURRI', 'JOINT');

-- CreateEnum
CREATE TYPE "WaqfNature" AS ENUM ('AYNI', 'QIYAMI');

-- CreateEnum
CREATE TYPE "EntitlementOrder" AS ENUM ('ORDERED', 'SHARED', 'NA_DIRECT_USE');

-- CreateEnum
CREATE TYPE "BeneficiaryLine" AS ENUM ('ZUHUR', 'BUTUN', 'NA');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED', 'PENDING', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "TxnType" AS ENUM ('REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('MAINTENANCE', 'OPERATIONS', 'NAZIR_FEE', 'ZAKAT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReceiptClass" AS ENUM ('INCOME', 'CAPITAL');

-- CreateEnum
CREATE TYPE "CapitalSource" AS ENUM ('SALE_PROCEEDS', 'ISTIBDAL_PROCEEDS', 'EXPROPRIATION_COMPENSATION', 'OTHER');

-- CreateEnum
CREATE TYPE "FeeBasis" AS ENUM ('PERCENT_OF_REVENUE', 'PERCENT_OF_NET_INCOME', 'RETAINER');

-- CreateEnum
CREATE TYPE "ClassificationGate" AS ENUM ('ALL', 'LARGE_MEDIUM', 'SMALL_DIRECT', 'LARGE_ONLY');

-- CreateEnum
CREATE TYPE "FilingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'N_A');

-- CreateEnum
CREATE TYPE "GovernmentPlatform" AS ENUM ('AWQAF_DIGITAL', 'BALADI', 'EJAR', 'ISTIHKAM', 'MUQEEM', 'QIWA');

-- CreateEnum
CREATE TYPE "ComplianceSection" AS ENUM ('FINANCIAL', 'OPERATIONAL', 'GOVERNMENT_LEGAL');

-- CreateEnum
CREATE TYPE "ComplianceTaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'RETIRED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('BANK_MOVEMENT', 'DISTRIBUTION_RUN', 'GOVT_FILING', 'RESERVED_MATTER');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED');

-- CreateEnum
CREATE TYPE "Confidentiality" AS ENUM ('NORMAL', 'SENSITIVE_PII', 'AML_RESTRICTED');

-- CreateEnum
CREATE TYPE "DistributionStatus" AS ENUM ('DRAFT', 'COMPUTED', 'PENDING_APPROVAL', 'APPROVED', 'EXECUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DistributionLineStatus" AS ENUM ('PAID', 'WITHHELD', 'CROSS_BORDER_PENDING', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "BeneficiaryKind" AS ENUM ('FAMILY', 'CHARITABLE_JIHA', 'CATEGORY_ONLY');

-- CreateEnum
CREATE TYPE "BeneficiaryResidency" AS ENUM ('DOMESTIC', 'CROSS_BORDER');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SYSTEM_ADMIN', 'NAZIR', 'AUTHORIZED_REP', 'MANDATE_LEAD', 'CASE_MANAGER', 'ACCOUNTANT', 'FINANCE', 'APPROVER', 'COMPLIANCE_OFFICER', 'AML_OFFICER', 'COUNSEL', 'AUDITOR', 'SUBCONTRACTOR', 'FAMILY_BOARD', 'LEADERSHIP', 'BENEFICIARY');

-- CreateEnum
CREATE TYPE "AuditCategory" AS ENUM ('ACCESS', 'MUTATION', 'APPROVAL', 'AUTH');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE_SOFT', 'APPROVE', 'REJECT', 'READ_SENSITIVE', 'EXPORT', 'LOGIN', 'LOGIN_FAILED', 'ACCESS_DENIED', 'FILING_STATUS_CHANGE', 'DISTRIBUTION_POST', 'AML_REPORT');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM', 'SERVICE');

-- CreateEnum
CREATE TYPE "AuditClassification" AS ENUM ('ROUTINE', 'SENSITIVE', 'RESTRICTED');

-- CreateTable
CREATE TABLE "client" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waqif" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "waqif_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waqf" (
    "id" TEXT NOT NULL,
    "waqifId" TEXT NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "deedNumber" TEXT NOT NULL,
    "classification" "WaqfClassification" NOT NULL,
    "type" "WaqfType" NOT NULL,
    "nature" "WaqfNature" NOT NULL,
    "entitlementOrder" "EntitlementOrder" NOT NULL,
    "shartAlWaqif" JSONB NOT NULL,
    "shartAlWaqifVersion" INTEGER NOT NULL DEFAULT 1,
    "shartAlWaqifSetAt" TIMESTAMP(3) NOT NULL,
    "shartAlWaqifSetAtHijri" TEXT NOT NULL,
    "fiscalYearEnd" TEXT NOT NULL,
    "registrationDate" TIMESTAMP(3) NOT NULL,
    "registrationDateHijri" TEXT NOT NULL,
    "certificateExpiry" TIMESTAMP(3),
    "certificateExpiryHijri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "waqf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trusteeship_deed" (
    "id" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "primaryNazir" TEXT NOT NULL,
    "primaryAppointedDate" TIMESTAMP(3) NOT NULL,
    "primaryAppointedDateHijri" TEXT NOT NULL,
    "authorizedRepName" TEXT,
    "authorizedRepScope" TEXT,
    "authorizedRepAppointedDate" TIMESTAMP(3),
    "authorizedRepAppointedDateHijri" TEXT,
    "jointlyLiable" BOOLEAN NOT NULL DEFAULT false,
    "successorNazir" TEXT,
    "islam" BOOLEAN NOT NULL,
    "legalCapacity" BOOLEAN NOT NULL,
    "noDisqualifyingRemoval" BOOLEAN NOT NULL,
    "ksaResident" BOOLEAN NOT NULL,
    "saudiNationalWhereRequired" BOOLEAN,
    "authorityLicensed" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "trusteeship_deed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset" (
    "id" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "titleDeedNumber" TEXT NOT NULL,
    "addressAr" TEXT NOT NULL,
    "addressEn" TEXT,
    "acquiredDate" TIMESTAMP(3) NOT NULL,
    "acquiredDateHijri" TEXT NOT NULL,
    "valuationSar" DECIMAL(18,2) NOT NULL,
    "valuationDate" TIMESTAMP(3),
    "valuationDateHijri" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expropriation" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "authorityAr" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "announcedDate" TIMESTAMP(3) NOT NULL,
    "announcedDateHijri" TEXT NOT NULL,
    "compensationSar" DECIMAL(18,2),
    "compensationStatus" TEXT NOT NULL,
    "istibdalStatus" TEXT NOT NULL,
    "replacementAssetId" TEXT,
    "authorityNotifiedDate" TIMESTAMP(3),
    "authorityNotifiedDateHijri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "expropriation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficiary" (
    "id" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "relationshipAr" TEXT NOT NULL,
    "relationshipEn" TEXT,
    "kind" "BeneficiaryKind" NOT NULL DEFAULT 'FAMILY',
    "residency" "BeneficiaryResidency" NOT NULL DEFAULT 'DOMESTIC',
    "categoryDescriptionAr" TEXT,
    "tabaqa" INTEGER,
    "line" "BeneficiaryLine" NOT NULL,
    "sharePercent" DECIMAL(9,4),
    "verificationStatus" "VerificationStatus" NOT NULL,
    "kycLastRefreshed" TIMESTAMP(3),
    "kycLastRefreshedHijri" TEXT,
    "isUbo" BOOLEAN NOT NULL DEFAULT false,
    "uboIdTypeEnc" TEXT,
    "uboIdNumberEnc" TEXT,
    "uboIdNumberHmac" TEXT,
    "uboBankingRefEnc" TEXT,
    "uboBankingRefHmac" TEXT,
    "uboShareOfProceeds" DECIMAL(9,4),
    "confidentiality" "Confidentiality" NOT NULL DEFAULT 'SENSITIVE_PII',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "beneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_account" (
    "id" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "accountRef" TEXT NOT NULL,
    "ibanEnc" TEXT NOT NULL,
    "ibanHmac" TEXT NOT NULL,
    "bankNameAr" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "isDedicated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "bank_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction" (
    "id" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "type" "TxnType" NOT NULL,
    "category" TEXT NOT NULL,
    "expenseCategory" "ExpenseCategory",
    "receiptClass" "ReceiptClass",
    "capitalSource" "CapitalSource",
    "capitalSourceNoteAr" TEXT,
    "descriptionAr" TEXT NOT NULL,
    "descriptionEn" TEXT,
    "amountSar" DECIMAL(18,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dateHijri" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "assetId" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget" (
    "id" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "revenueEstimate" DECIMAL(18,2) NOT NULL,
    "expenseEstimate" DECIMAL(18,2) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedAtHijri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nazir_fee" (
    "id" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "basis" "FeeBasis" NOT NULL DEFAULT 'PERCENT_OF_REVENUE',
    "percent" DECIMAL(6,3),
    "amountSar" DECIMAL(18,2) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "periodEndHijri" TEXT NOT NULL,
    "deductedBeforeDistribution" BOOLEAN NOT NULL DEFAULT true,
    "invoiceRef" TEXT,
    "sourceNote" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "nazir_fee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution" (
    "id" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodStartHijri" TEXT NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "periodEndHijri" TEXT NOT NULL,
    "grossRevenueSar" DECIMAL(18,2) NOT NULL,
    "reserveSar" DECIMAL(18,2) NOT NULL,
    "operatingSar" DECIMAL(18,2) NOT NULL,
    "nazirFeeSar" DECIMAL(18,2) NOT NULL,
    "distributableSar" DECIMAL(18,2) NOT NULL,
    "status" "DistributionStatus" NOT NULL,
    "approvalRequestId" TEXT,
    "executedAt" TIMESTAMP(3),
    "executedAtHijri" TEXT,
    "computationTrace" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "distribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_line_item" (
    "id" TEXT NOT NULL,
    "distributionId" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "status" "DistributionLineStatus" NOT NULL DEFAULT 'PAID',
    "sharePercent" DECIMAL(9,4) NOT NULL,
    "amountSar" DECIMAL(18,2) NOT NULL,
    "transferRef" TEXT,
    "blockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "distribution_line_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_obligation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "section" "ComplianceSection" NOT NULL,
    "workstreamAr" TEXT NOT NULL,
    "workstreamEn" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "gate" "ClassificationGate" NOT NULL,
    "deadlineRuleKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "compliance_obligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_task" (
    "id" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "status" "ComplianceTaskStatus" NOT NULL,
    "owner" TEXT,
    "startDate" TIMESTAMP(3),
    "startDateHijri" TEXT,
    "closeDate" TIMESTAMP(3),
    "closeDateHijri" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "compliance_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "government_filing" (
    "id" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "platform" "GovernmentPlatform" NOT NULL,
    "status" "FilingStatus" NOT NULL,
    "lastUpdated" TIMESTAMP(3),
    "lastUpdatedHijri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "government_filing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deadline" (
    "id" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "complianceTaskId" TEXT,
    "ruleKey" TEXT NOT NULL,
    "anchorDate" TIMESTAMP(3) NOT NULL,
    "anchorDateHijri" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "dueDateHijri" TEXT NOT NULL,
    "businessDaysUsed" INTEGER NOT NULL,
    "satisfiedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "deadline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reclassification_event" (
    "id" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "from" "WaqfClassification" NOT NULL,
    "to" "WaqfClassification" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "atHijri" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "reclassification_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "beneficiaryId" TEXT,
    "type" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "confidentiality" "Confidentiality" NOT NULL DEFAULT 'NORMAL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "retentionUntilHijri" TEXT NOT NULL,
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lease" (
    "id" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "tenantAr" TEXT NOT NULL,
    "rentSar" DECIMAL(18,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "startDateHijri" TEXT NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "endDateHijri" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "ejarRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "lease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_ticket" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "openedAtHijri" TEXT NOT NULL,
    "vendorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "maintenance_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "licenseNo" TEXT,
    "licenseExpiry" TIMESTAMP(3),
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_case" (
    "id" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "subjectAr" TEXT NOT NULL,
    "forum" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "nextHearing" TIMESTAMP(3),
    "nextHearingHijri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "legal_case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zakat_filing" (
    "id" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amountSar" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "zakat_filing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "twoFactorEnabled" BOOLEAN DEFAULT false,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "password" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "verified" BOOLEAN DEFAULT true,
    "failedVerificationCount" INTEGER DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "two_factor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waqf_access_grant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "permissions" TEXT[],
    "dataScopes" TEXT[],
    "canViewAmlRestricted" BOOLEAN NOT NULL DEFAULT false,
    "amlCompartment" BOOLEAN NOT NULL DEFAULT false,
    "beneficiarySelfId" TEXT,
    "scopeRefs" TEXT[],
    "grantedByUserId" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "waqf_access_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_request" (
    "id" TEXT NOT NULL,
    "waqfId" TEXT NOT NULL,
    "type" "ApprovalType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL,
    "makerId" TEXT NOT NULL,
    "checkerId" TEXT,
    "counselReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "authorityNoticeRequired" BOOLEAN NOT NULL DEFAULT false,
    "authorityReference" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedAtHijri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "approval_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" BIGSERIAL NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurredAtHijri" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" "AuditActorType" NOT NULL,
    "onBehalfOfId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "waqfId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "context" JSONB NOT NULL,
    "category" "AuditCategory" NOT NULL,
    "classification" "AuditClassification" NOT NULL DEFAULT 'ROUTINE',
    "prevHash" CHAR(64) NOT NULL,
    "rowHash" CHAR(64) NOT NULL,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_chain_head" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastId" BIGINT NOT NULL DEFAULT 0,
    "lastRowHash" CHAR(64) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_chain_head_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setting" (
    "id" TEXT NOT NULL,
    "waqfId" TEXT,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holiday_calendar" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dateHijri" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "isWorkingDay" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holiday_calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "waqfId" TEXT,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "waqif_clientId_idx" ON "waqif"("clientId");

-- CreateIndex
CREATE INDEX "waqf_waqifId_idx" ON "waqf"("waqifId");

-- CreateIndex
CREATE INDEX "waqf_classification_idx" ON "waqf"("classification");

-- CreateIndex
CREATE INDEX "waqf_deedNumber_idx" ON "waqf"("deedNumber");

-- CreateIndex
CREATE UNIQUE INDEX "waqf_certificateNumber_key" ON "waqf"("certificateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "trusteeship_deed_waqfId_key" ON "trusteeship_deed"("waqfId");

-- CreateIndex
CREATE INDEX "asset_waqfId_idx" ON "asset"("waqfId");

-- CreateIndex
CREATE INDEX "asset_titleDeedNumber_idx" ON "asset"("titleDeedNumber");

-- CreateIndex
CREATE INDEX "expropriation_waqfId_idx" ON "expropriation"("waqfId");

-- CreateIndex
CREATE INDEX "expropriation_assetId_idx" ON "expropriation"("assetId");

-- CreateIndex
CREATE INDEX "beneficiary_waqfId_idx" ON "beneficiary"("waqfId");

-- CreateIndex
CREATE INDEX "beneficiary_uboIdNumberHmac_idx" ON "beneficiary"("uboIdNumberHmac");

-- CreateIndex
CREATE INDEX "beneficiary_uboBankingRefHmac_idx" ON "beneficiary"("uboBankingRefHmac");

-- CreateIndex
CREATE INDEX "beneficiary_waqfId_tabaqa_idx" ON "beneficiary"("waqfId", "tabaqa");

-- CreateIndex
CREATE INDEX "bank_account_waqfId_idx" ON "bank_account"("waqfId");

-- CreateIndex
CREATE UNIQUE INDEX "bank_account_ibanHmac_key" ON "bank_account"("ibanHmac");

-- CreateIndex
CREATE INDEX "transaction_waqfId_date_idx" ON "transaction"("waqfId", "date");

-- CreateIndex
CREATE INDEX "transaction_waqfId_type_receiptClass_date_idx" ON "transaction"("waqfId", "type", "receiptClass", "date");

-- CreateIndex
CREATE INDEX "transaction_bankAccountId_idx" ON "transaction"("bankAccountId");

-- CreateIndex
CREATE INDEX "transaction_assetId_idx" ON "transaction"("assetId");

-- CreateIndex
CREATE INDEX "budget_waqfId_idx" ON "budget"("waqfId");

-- CreateIndex
CREATE UNIQUE INDEX "budget_waqfId_fiscalYear_key" ON "budget"("waqfId", "fiscalYear");

-- CreateIndex
CREATE INDEX "nazir_fee_waqfId_periodEnd_idx" ON "nazir_fee"("waqfId", "periodEnd");

-- CreateIndex
CREATE INDEX "distribution_waqfId_periodEnd_idx" ON "distribution"("waqfId", "periodEnd");

-- CreateIndex
CREATE INDEX "distribution_line_item_distributionId_idx" ON "distribution_line_item"("distributionId");

-- CreateIndex
CREATE INDEX "distribution_line_item_beneficiaryId_idx" ON "distribution_line_item"("beneficiaryId");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_obligation_code_key" ON "compliance_obligation"("code");

-- CreateIndex
CREATE INDEX "compliance_task_waqfId_status_idx" ON "compliance_task"("waqfId", "status");

-- CreateIndex
CREATE INDEX "compliance_task_obligationId_idx" ON "compliance_task"("obligationId");

-- CreateIndex
CREATE INDEX "government_filing_waqfId_idx" ON "government_filing"("waqfId");

-- CreateIndex
CREATE UNIQUE INDEX "government_filing_waqfId_platform_key" ON "government_filing"("waqfId", "platform");

-- CreateIndex
CREATE INDEX "deadline_waqfId_dueDate_idx" ON "deadline"("waqfId", "dueDate");

-- CreateIndex
CREATE INDEX "deadline_ruleKey_idx" ON "deadline"("ruleKey");

-- CreateIndex
CREATE INDEX "deadline_complianceTaskId_idx" ON "deadline"("complianceTaskId");

-- CreateIndex
CREATE INDEX "reclassification_event_waqfId_at_idx" ON "reclassification_event"("waqfId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "document_storageKey_key" ON "document"("storageKey");

-- CreateIndex
CREATE INDEX "document_waqfId_type_idx" ON "document"("waqfId", "type");

-- CreateIndex
CREATE INDEX "document_beneficiaryId_idx" ON "document"("beneficiaryId");

-- CreateIndex
CREATE INDEX "lease_waqfId_idx" ON "lease"("waqfId");

-- CreateIndex
CREATE INDEX "lease_assetId_idx" ON "lease"("assetId");

-- CreateIndex
CREATE INDEX "maintenance_ticket_assetId_idx" ON "maintenance_ticket"("assetId");

-- CreateIndex
CREATE INDEX "maintenance_ticket_vendorId_idx" ON "maintenance_ticket"("vendorId");

-- CreateIndex
CREATE INDEX "legal_case_waqfId_idx" ON "legal_case"("waqfId");

-- CreateIndex
CREATE INDEX "zakat_filing_waqfId_idx" ON "zakat_filing"("waqfId");

-- CreateIndex
CREATE UNIQUE INDEX "zakat_filing_waqfId_fiscalYear_key" ON "zakat_filing"("waqfId", "fiscalYear");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "two_factor_userId_idx" ON "two_factor"("userId");

-- CreateIndex
CREATE INDEX "two_factor_secret_idx" ON "two_factor"("secret");

-- CreateIndex
CREATE INDEX "membership_userId_idx" ON "membership"("userId");

-- CreateIndex
CREATE INDEX "membership_clientId_idx" ON "membership"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "membership_userId_clientId_role_key" ON "membership"("userId", "clientId", "role");

-- CreateIndex
CREATE INDEX "waqf_access_grant_waqfId_idx" ON "waqf_access_grant"("waqfId");

-- CreateIndex
CREATE INDEX "waqf_access_grant_userId_idx" ON "waqf_access_grant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "waqf_access_grant_userId_waqfId_role_key" ON "waqf_access_grant"("userId", "waqfId", "role");

-- CreateIndex
CREATE INDEX "approval_request_waqfId_status_idx" ON "approval_request"("waqfId", "status");

-- CreateIndex
CREATE INDEX "audit_event_waqfId_occurredAt_idx" ON "audit_event"("waqfId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_event_entityType_entityId_idx" ON "audit_event"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_event_actorId_occurredAt_idx" ON "audit_event"("actorId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_event_action_occurredAt_idx" ON "audit_event"("action", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "audit_event_rowHash_key" ON "audit_event"("rowHash");

-- CreateIndex
CREATE INDEX "setting_key_idx" ON "setting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "setting_waqfId_key_key" ON "setting"("waqfId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "holiday_calendar_date_key" ON "holiday_calendar"("date");

-- CreateIndex
CREATE INDEX "notification_userId_idx" ON "notification"("userId");

-- CreateIndex
CREATE INDEX "notification_userId_readAt_idx" ON "notification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "waqif" ADD CONSTRAINT "waqif_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waqf" ADD CONSTRAINT "waqf_waqifId_fkey" FOREIGN KEY ("waqifId") REFERENCES "waqif"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trusteeship_deed" ADD CONSTRAINT "trusteeship_deed_waqfId_fkey" FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_waqfId_fkey" FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expropriation" ADD CONSTRAINT "expropriation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expropriation" ADD CONSTRAINT "expropriation_waqfId_fkey" FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiary" ADD CONSTRAINT "beneficiary_waqfId_fkey" FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_waqfId_fkey" FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_waqfId_fkey" FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget" ADD CONSTRAINT "budget_waqfId_fkey" FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nazir_fee" ADD CONSTRAINT "nazir_fee_waqfId_fkey" FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution" ADD CONSTRAINT "distribution_waqfId_fkey" FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_line_item" ADD CONSTRAINT "distribution_line_item_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "distribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_line_item" ADD CONSTRAINT "distribution_line_item_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "beneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_task" ADD CONSTRAINT "compliance_task_waqfId_fkey" FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_task" ADD CONSTRAINT "compliance_task_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "compliance_obligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "government_filing" ADD CONSTRAINT "government_filing_waqfId_fkey" FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deadline" ADD CONSTRAINT "deadline_waqfId_fkey" FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reclassification_event" ADD CONSTRAINT "reclassification_event_waqfId_fkey" FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_waqfId_fkey" FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "beneficiary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease" ADD CONSTRAINT "lease_waqfId_fkey" FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease" ADD CONSTRAINT "lease_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_ticket" ADD CONSTRAINT "maintenance_ticket_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_case" ADD CONSTRAINT "legal_case_waqfId_fkey" FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zakat_filing" ADD CONSTRAINT "zakat_filing_waqfId_fkey" FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waqf_access_grant" ADD CONSTRAINT "waqf_access_grant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waqf_access_grant" ADD CONSTRAINT "waqf_access_grant_waqfId_fkey" FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_request" ADD CONSTRAINT "approval_request_waqfId_fkey" FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setting" ADD CONSTRAINT "setting_waqfId_fkey" FOREIGN KEY ("waqfId") REFERENCES "waqf"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

