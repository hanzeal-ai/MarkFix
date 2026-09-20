BEGIN;
-- Keep old producers from writing after the contract check commits.
ALTER TABLE "Report" ADD CONSTRAINT "Report_capture_bundle_v2"
  CHECK (COALESCE(jsonb_typeof("captureBundle") = 'object'
    AND "captureBundle" @> '{"schemaVersion":2}'::jsonb
    AND NOT ("captureBundle" ? 'annotations'), false));
ALTER TABLE "ReportSubmission" ADD CONSTRAINT "ReportSubmission_capture_bundle_v2"
  CHECK (COALESCE(jsonb_typeof(payload->'captureBundle') = 'object'
    AND payload->'captureBundle' @> '{"schemaVersion":2}'::jsonb
    AND NOT (payload->'captureBundle' ? 'annotations'), false));
LOCK TABLE "ManagedAnnotation" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "ManagedAnnotation") THEN
    RAISE EXCEPTION 'ManagedAnnotation contains data; export and reconcile it before applying this migration. No records were changed.';
  END IF;
  IF EXISTS (SELECT 1 FROM "Activity" WHERE type = 'ANNOTATION_STATUS_CHANGED' AND payload->>'status' = 'IN_REVIEW') THEN
    RAISE EXCEPTION 'Unsupported annotation history status IN_REVIEW; review stored history before upgrading.';
  END IF;
  IF EXISTS (SELECT 1 FROM "ProjectDesktopState" WHERE payload->'project' ? 'workspaceId') THEN
    RAISE EXCEPTION 'Unsupported workspaceId in desktop project state; review stored projects before upgrading.';
  END IF;
  IF EXISTS (SELECT 1 FROM "ProjectAnnotationRecord" WHERE
    (kind = 'CAPTURE' AND (jsonb_typeof(payload->'page') IS DISTINCT FROM 'object' OR jsonb_typeof(payload->'capture') IS DISTINCT FROM 'object')) OR
    (kind = 'ELEMENT_COMMENT' AND jsonb_typeof(payload->'anchor'->'runtimeEvidence') IS DISTINCT FROM 'object')) THEN
    RAISE EXCEPTION 'Unsupported saved annotation context; review stored records before upgrading.';
  END IF;
  IF EXISTS (SELECT 1 FROM "ProjectAnnotationBatch" b, LATERAL jsonb_array_elements(b.payload->'captures') c
    WHERE jsonb_typeof(c->'page') IS DISTINCT FROM 'object' OR jsonb_typeof(c->'capture') IS DISTINCT FROM 'object') OR
     EXISTS (SELECT 1 FROM "ProjectAnnotationBatch" b, LATERAL jsonb_array_elements(b.payload->'elementComments') c
    WHERE jsonb_typeof(c->'anchor'->'runtimeEvidence') IS DISTINCT FROM 'object') THEN
    RAISE EXCEPTION 'Unsupported submitted annotation context; review stored batches before upgrading.';
  END IF;
END $$;
DROP TABLE "ManagedAnnotation";
DROP TYPE "ManagedAnnotationStatus";
DROP TYPE "ManagedAnnotationKind";
COMMIT;
