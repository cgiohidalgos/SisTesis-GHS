
-- 1. Role enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('student', 'evaluator', 'admin');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2. Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  student_code TEXT,
  cedula TEXT,
  institutional_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Theses table
CREATE TABLE public.theses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  abstract TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.theses ENABLE ROW LEVEL SECURITY;

-- 4. Thesis students (1-2 students per thesis)
CREATE TABLE public.thesis_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID REFERENCES public.theses(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  UNIQUE (thesis_id, student_id)
);
ALTER TABLE public.thesis_students ENABLE ROW LEVEL SECURITY;

-- 5. Thesis files (DOCX, PDF, URLs)
CREATE TABLE public.thesis_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID REFERENCES public.theses(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'pdf', 'docx', 'url', 'other'
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.thesis_files ENABLE ROW LEVEL SECURITY;

-- 6. Thesis evaluators assignment
CREATE TABLE public.thesis_evaluators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID REFERENCES public.theses(id) ON DELETE CASCADE NOT NULL,
  evaluator_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  is_blind BOOLEAN NOT NULL DEFAULT false,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (thesis_id, evaluator_id)
);
ALTER TABLE public.thesis_evaluators ENABLE ROW LEVEL SECURITY;

-- 7. Evaluations
CREATE TABLE public.evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_evaluator_id UUID REFERENCES public.thesis_evaluators(id) ON DELETE CASCADE NOT NULL,
  final_score NUMERIC(4,2),
  concept TEXT, -- 'accepted', 'minor_changes', 'major_changes'
  general_observations TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (thesis_evaluator_id)
);
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

-- 8. Evaluation criterion scores
CREATE TABLE public.evaluation_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID REFERENCES public.evaluations(id) ON DELETE CASCADE NOT NULL,
  section_id TEXT NOT NULL,
  criterion_id TEXT NOT NULL,
  score NUMERIC(3,1),
  observations TEXT,
  UNIQUE (evaluation_id, criterion_id)
);
ALTER TABLE public.evaluation_scores ENABLE ROW LEVEL SECURITY;

-- 9. Evaluation files (uploaded by evaluators, visible to students)
CREATE TABLE public.evaluation_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID REFERENCES public.evaluations(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.evaluation_files ENABLE ROW LEVEL SECURITY;

-- 10. Timeline events
CREATE TABLE public.timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID REFERENCES public.theses(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name TEXT,
  actor_role TEXT,
  attachments TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.timeline_events ENABLE ROW LEVEL SECURITY;

-- ============ HELPER FUNCTIONS ============

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_thesis_student(_user_id UUID, _thesis_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.thesis_students
    WHERE student_id = _user_id AND thesis_id = _thesis_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_evaluator(_user_id UUID, _thesis_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.thesis_evaluators
    WHERE evaluator_id = _user_id AND thesis_id = _thesis_id
  )
$$;

-- ============ RLS POLICIES ============

-- user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Evaluators can view assigned student profiles" ON public.profiles
  FOR SELECT USING (
    public.has_role(auth.uid(), 'evaluator') AND
    EXISTS (
      SELECT 1 FROM public.thesis_evaluators te
      JOIN public.thesis_students ts ON ts.thesis_id = te.thesis_id
      WHERE te.evaluator_id = auth.uid() AND ts.student_id = profiles.id
      AND te.is_blind = false
    )
  );
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- theses
CREATE POLICY "Students can view own theses" ON public.theses
  FOR SELECT USING (public.is_thesis_student(auth.uid(), id));
CREATE POLICY "Evaluators can view assigned theses" ON public.theses
  FOR SELECT USING (public.is_assigned_evaluator(auth.uid(), id));
CREATE POLICY "Admins can manage all theses" ON public.theses
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Students can create theses" ON public.theses
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'student') AND created_by = auth.uid());
CREATE POLICY "Students can update own theses" ON public.theses
  FOR UPDATE USING (public.is_thesis_student(auth.uid(), id));

-- thesis_students
CREATE POLICY "Students can view own memberships" ON public.thesis_students
  FOR SELECT USING (student_id = auth.uid());
CREATE POLICY "Admins can manage thesis students" ON public.thesis_students
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Students can add themselves" ON public.thesis_students
  FOR INSERT WITH CHECK (student_id = auth.uid());

-- thesis_files
CREATE POLICY "Students can view own thesis files" ON public.thesis_files
  FOR SELECT USING (public.is_thesis_student(auth.uid(), thesis_id));
CREATE POLICY "Evaluators can view assigned thesis files" ON public.thesis_files
  FOR SELECT USING (public.is_assigned_evaluator(auth.uid(), thesis_id));
CREATE POLICY "Admins can manage all thesis files" ON public.thesis_files
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Students can upload thesis files" ON public.thesis_files
  FOR INSERT WITH CHECK (public.is_thesis_student(auth.uid(), thesis_id) AND uploaded_by = auth.uid());

-- thesis_evaluators
CREATE POLICY "Students can view evaluators of own theses" ON public.thesis_evaluators
  FOR SELECT USING (public.is_thesis_student(auth.uid(), thesis_id));
CREATE POLICY "Evaluators can view own assignments" ON public.thesis_evaluators
  FOR SELECT USING (evaluator_id = auth.uid());
CREATE POLICY "Admins can manage evaluator assignments" ON public.thesis_evaluators
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- evaluations
CREATE POLICY "Evaluators can manage own evaluations" ON public.evaluations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.thesis_evaluators te
      WHERE te.id = evaluations.thesis_evaluator_id AND te.evaluator_id = auth.uid()
    )
  );
CREATE POLICY "Admins can manage all evaluations" ON public.evaluations
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Students can view evaluations of own theses" ON public.evaluations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.thesis_evaluators te
      JOIN public.thesis_students ts ON ts.thesis_id = te.thesis_id
      WHERE te.id = evaluations.thesis_evaluator_id AND ts.student_id = auth.uid()
    )
  );

-- evaluation_scores
CREATE POLICY "Evaluators can manage own scores" ON public.evaluation_scores
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.evaluations e
      JOIN public.thesis_evaluators te ON te.id = e.thesis_evaluator_id
      WHERE e.id = evaluation_scores.evaluation_id AND te.evaluator_id = auth.uid()
    )
  );
CREATE POLICY "Admins can manage all scores" ON public.evaluation_scores
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Students can view scores of own theses" ON public.evaluation_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.evaluations e
      JOIN public.thesis_evaluators te ON te.id = e.thesis_evaluator_id
      JOIN public.thesis_students ts ON ts.thesis_id = te.thesis_id
      WHERE e.id = evaluation_scores.evaluation_id AND ts.student_id = auth.uid()
    )
  );

-- evaluation_files
CREATE POLICY "Evaluators can manage own evaluation files" ON public.evaluation_files
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.evaluations e
      JOIN public.thesis_evaluators te ON te.id = e.thesis_evaluator_id
      WHERE e.id = evaluation_files.evaluation_id AND te.evaluator_id = auth.uid()
    )
  );
CREATE POLICY "Admins can manage all evaluation files" ON public.evaluation_files
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Students can view evaluation files of own theses" ON public.evaluation_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.evaluations e
      JOIN public.thesis_evaluators te ON te.id = e.thesis_evaluator_id
      JOIN public.thesis_students ts ON ts.thesis_id = te.thesis_id
      WHERE e.id = evaluation_files.evaluation_id AND ts.student_id = auth.uid()
    )
  );

-- timeline_events
CREATE POLICY "Students can view own thesis events" ON public.timeline_events
  FOR SELECT USING (public.is_thesis_student(auth.uid(), thesis_id));
CREATE POLICY "Evaluators can view assigned thesis events" ON public.timeline_events
  FOR SELECT USING (public.is_assigned_evaluator(auth.uid(), thesis_id));
CREATE POLICY "Admins can manage all events" ON public.timeline_events
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ============ STORAGE ============

INSERT INTO storage.buckets (id, name, public) VALUES ('thesis-documents', 'thesis-documents', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('evaluation-files', 'evaluation-files', false);

-- Storage policies for thesis documents
CREATE POLICY "Students can upload thesis docs" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'thesis-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view thesis docs" ON storage.objects
  FOR SELECT USING (bucket_id = 'thesis-documents');

-- Storage policies for evaluation files
CREATE POLICY "Evaluators can upload evaluation files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'evaluation-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view evaluation files" ON storage.objects
  FOR SELECT USING (bucket_id = 'evaluation-files');

-- ============ TRIGGERS ============

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_theses_updated_at BEFORE UPDATE ON public.theses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_evaluations_updated_at BEFORE UPDATE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-create timeline event when thesis is created
CREATE OR REPLACE FUNCTION public.handle_thesis_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.timeline_events (thesis_id, event_type, label, description, actor_id, actor_role)
  VALUES (NEW.id, 'submitted', 'Tesis Enviada', 'Documento recibido correctamente.', NEW.created_by, 'student');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_thesis_created
  AFTER INSERT ON public.theses
  FOR EACH ROW EXECUTE FUNCTION public.handle_thesis_created();
