CREATE TABLE eve.notification_control (
  id integer PRIMARY KEY CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  enabled_at timestamptz
);
INSERT INTO eve.notification_control(id) VALUES (1);
--> statement-breakpoint
CREATE TABLE eve.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  watchers boolean NOT NULL DEFAULT true,
  growth boolean NOT NULL DEFAULT true,
  enrolled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE eve.notification_jobs (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  subject_id text,
  payload jsonb NOT NULL DEFAULT '{}',
  due_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  state text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  last_error text,
  subject text,
  html text,
  plain_text text,
  chart_png text,
  provider_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_due_idx ON eve.notification_jobs(state, due_at);
CREATE INDEX notification_user_sent_idx ON eve.notification_jobs(user_id, sent_at);
--> statement-breakpoint
CREATE TABLE eve.watcher_observations (
  id bigserial PRIMARY KEY,
  watcher_id text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  value text,
  status text NOT NULL,
  good_check boolean NOT NULL DEFAULT false
);
CREATE INDEX watcher_observations_watch_idx ON eve.watcher_observations(watcher_id, at);
--> statement-breakpoint
CREATE FUNCTION eve.capture_watcher_notification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.last_checked_at IS DISTINCT FROM OLD.last_checked_at THEN
    INSERT INTO eve.watcher_observations(watcher_id, value, status, good_check)
      VALUES (NEW.id, NEW.last_value, NEW.status,
        NEW.last_checked_at IS NOT NULL AND NEW.last_error IS NULL AND NEW.status = 'ARMED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM eve.notification_control WHERE id = 1 AND enabled) THEN RETURN NEW; END IF;
  IF NEW.status = 'ERROR' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'ERROR') THEN
    INSERT INTO eve.notification_jobs(id, user_id, kind, subject_id, payload)
      VALUES ('stopped:' || NEW.id || ':' || md5(coalesce(NEW.last_error, '')), NEW.user_id,
        'watcher-stopped', NEW.id, jsonb_build_object('error', NEW.last_error, 'at', now()))
      ON CONFLICT DO NOTHING;
  ELSIF NEW.status = 'EXPIRED' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'EXPIRED') THEN
    INSERT INTO eve.notification_jobs(id, user_id, kind, subject_id, due_at)
      VALUES ('ended:' || NEW.id, NEW.user_id, 'watcher-ended', NEW.id,
        greatest(now(), ((NEW.expires_at AT TIME ZONE 'Asia/Kolkata')::date + time '16:00') AT TIME ZONE 'Asia/Kolkata'))
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER eve_watcher_notification AFTER INSERT OR UPDATE ON watchers
  FOR EACH ROW EXECUTE FUNCTION eve.capture_watcher_notification();
--> statement-breakpoint
CREATE FUNCTION eve.capture_watcher_fire() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM eve.notification_control WHERE id = 1 AND enabled) THEN
    INSERT INTO eve.notification_jobs(id, user_id, kind, subject_id, payload)
      SELECT 'alert:' || NEW.id, w.user_id, 'watcher-alert', w.id,
        jsonb_build_object('fireId', NEW.id, 'value', NEW.value, 'detail', NEW.detail, 'at', NEW.fired_at)
      FROM watchers w WHERE w.id = NEW.watcher_id ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER eve_watcher_fire AFTER INSERT ON watcher_fires
  FOR EACH ROW EXECUTE FUNCTION eve.capture_watcher_fire();
