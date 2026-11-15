CREATE TABLE "TorobConnection" (
  "organizationId" TEXT NOT NULL,
  "credentialCiphertext" TEXT NOT NULL,
  "domain" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TorobConnection_pkey" PRIMARY KEY ("organizationId"),
  CONSTRAINT "TorobConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
