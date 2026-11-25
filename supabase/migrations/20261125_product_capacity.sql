-- Optional product capacity / size label (examples: 250 g, 500 g, 1 L)
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS capacity text;
