-- =========================================================================
--  Bigode Pescador — estrutura do banco (Supabase / Postgres)
--
--  COMO USAR (não precisa entender nada de banco):
--   1. Entre em https://supabase.com e crie um projeto (o plano free serve).
--   2. No menu da esquerda, clique em "SQL Editor".
--   3. Cole este arquivo INTEIRO e clique em "Run".
--   4. Vá em "Project Settings" → "API" e copie dois valores:
--        • Project URL          (ex.: https://abcdefgh.supabase.co)
--        • anon / public key    (uma chave longa começando com "eyJ...")
--   5. No app, abra Ajustes → Sincronização, cole os dois e salve.
--
--  Rodar este arquivo de novo não quebra nada: tudo é "if not exists".
-- =========================================================================


-- ---- Tabelas -------------------------------------------------------------

-- Cada pescaria é uma etapa, com ranking próprio.
create table if not exists public.etapas (
  id            text primary key,
  nome          text not null,
  local         text default '',
  data          date not null,
  encerrada     boolean not null default false,
  removida      boolean not null default false,
  criada_em     timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

-- Os peixes e seus fatores. Fica no banco para o grupo inteiro usar
-- a mesma régua — se o Rodrigo mudar um fator, muda para todo mundo.
create table if not exists public.peixes (
  nome          text primary key,
  fator         numeric not null default 0,
  modo          text not null default 'formula',   -- 'formula' | 'fixa'
  pontos_fixos  numeric not null default 0,
  trofeu        boolean not null default false,
  penalidade    boolean not null default false,
  removido      boolean not null default false,
  atualizada_em timestamptz not null default now()
);

-- Os pescadores do campeonato. Ficam no banco para a lista ser a mesma em todos
-- os aparelhos — quem for adicionado no PC aparece no celular de todo mundo.
create table if not exists public.pescadores (
  nome          text primary key,
  removido      boolean not null default false,
  atualizada_em timestamptz not null default now()
);

-- Cada peixe registrado por alguém.
create table if not exists public.pescas (
  id            text primary key,
  etapa_id      text not null references public.etapas(id) on delete cascade,
  pescador      text not null,
  tipo          text not null,
  fator         numeric not null default 0,
  modo          text not null default 'formula',
  peso_gramas   numeric not null default 0,
  tamanho       numeric not null default 0,
  pontuacao     numeric not null default 0,
  data          timestamptz not null default now(),
  removida      boolean not null default false,
  criada_em     timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

-- NOTA: as fotos não sobem para o banco de propósito. Elas ficam no aparelho
-- de quem tirou. Subir foto consome o armazenamento do plano free rápido e
-- não é necessário para o ranking. Se um dia quiserem, o caminho é o Supabase
-- Storage — não uma coluna aqui.


-- ---- Índices -------------------------------------------------------------
-- O app pergunta "o que mudou desde a última vez?" a cada 20 segundos.
-- Estes índices fazem essa pergunta ser instantânea.

create index if not exists idx_etapas_atualizada on public.etapas (atualizada_em);
create index if not exists idx_peixes_atualizada on public.peixes (atualizada_em);
create index if not exists idx_pescas_atualizada on public.pescas (atualizada_em);
create index if not exists idx_pescas_etapa      on public.pescas (etapa_id);
create index if not exists idx_pescadores_atualizada on public.pescadores (atualizada_em);


-- ---- Segurança -----------------------------------------------------------
--
--  ATENÇÃO, em português claro:
--
--  A "anon key" é uma chave pública — ela fica no celular de cada um e é
--  visível para quem tiver o link. As regras abaixo permitem que qualquer
--  pessoa COM ESSA CHAVE leia e grave. Para um campeonato de 4 amigos isso
--  é aceitável: o pior caso é alguém bagunçar o placar, não vazar dado
--  sensível. Não guarde nada pessoal aqui.
--
--  Repare que DELETE não é permitido para ninguém: o app "apaga" marcando
--  removida = true. Assim ninguém consegue destruir o histórico do grupo,
--  nem por acidente nem de propósito.

alter table public.etapas enable row level security;
alter table public.peixes enable row level security;
alter table public.pescas enable row level security;
alter table public.pescadores enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['etapas', 'peixes', 'pescas', 'pescadores'] loop
    execute format('drop policy if exists "ler_%1$s"       on public.%1$I', t);
    execute format('drop policy if exists "inserir_%1$s"   on public.%1$I', t);
    execute format('drop policy if exists "atualizar_%1$s" on public.%1$I', t);

    execute format($f$create policy "ler_%1$s"       on public.%1$I for select using (true)$f$, t);
    execute format($f$create policy "inserir_%1$s"   on public.%1$I for insert with check (true)$f$, t);
    execute format($f$create policy "atualizar_%1$s" on public.%1$I for update using (true) with check (true)$f$, t);
  end loop;
end $$;


-- ---- Quem escreveu por último vence, valendo também aqui -------------------
--
--  O app já resolve conflito por data quando RECEBE um registro. Faltava o
--  mesmo cuidado na hora de GRAVAR: o "merge-duplicates" que ele usa para
--  enviar sobrescreve a linha sem olhar data nenhuma, então uma escrita velha
--  chegando atrasada apagava uma nova.
--
--  O caso concreto que isso resolve: alguém instala o app num celular zerado.
--  Ao abrir pela primeira vez, o app monta a lista de peixes padrão com data
--  de 1970 de propósito (é o jeito de marcar "isto é só o padrão, não uma
--  escolha de ninguém"). Se essa lista subisse por cima do banco, um peixe que
--  o grupo tinha tirado da lista voltava para o celular de todo mundo.
--
--  Agora o banco ignora quem chega com data mais velha do que a que já está lá.

create or replace function public.carimbar_atualizacao()
returns trigger
language plpgsql
as $$
begin
  -- Chegou mais velho do que o que já está gravado? Não faz nada.
  -- Devolver "old" num gatilho BEFORE mantém a linha exatamente como estava.
  if new.atualizada_em < old.atualizada_em then
    return old;
  end if;

  new.atualizada_em = greatest(now(), new.atualizada_em);
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['etapas', 'peixes', 'pescas', 'pescadores'] loop
    execute format('drop trigger if exists trg_carimbo_%1$s on public.%1$I', t);
    execute format(
      'create trigger trg_carimbo_%1$s before update on public.%1$I
         for each row execute function public.carimbar_atualizacao()', t);
  end loop;
end $$;


-- ---- Peixes iniciais -----------------------------------------------------
-- Os fatores combinados no grupo. Quem decide é o Rodrigo.
-- "on conflict do nothing" = se já existir, não sobrescreve edições do grupo.

insert into public.peixes (nome, fator, modo, pontos_fixos, trofeu, penalidade) values
  ('Robalo',       5,    'formula', 0, false, false),  -- Rodrigo: "robalo - 5"
  ('Caranha',      5,    'formula', 0, false, false),  -- "mesmo peso de caranha e pescada e robalo"
  ('Pescada',      5,    'formula', 0, false, false),  -- idem
  ('Traíra',       5,    'formula', 0, false, false),  -- Alex "Traíra? 5?" / Rodrigo "sim sim"
  ('Corvina',      4,    'formula', 0, false, false),  -- ⚠️ sem confirmação do Rodrigo
  ('Bagre',        2,    'formula', 0, false, false),  -- Rodrigo: "bagre - 2"
  ('Peixe Galo',  10,    'formula', 0, true,  false),  -- "super trunfo... 10 pontos"
  ('Baiacu',      -0.5,  'formula', 0, false, true)    -- "coloca baiacu menos 0,5"
on conflict (nome) do nothing;


-- ---- Pescadores iniciais -------------------------------------------------
-- Os 4 do grupo. "on conflict do nothing" preserva edições feitas depois.

insert into public.pescadores (nome) values
  ('Luis Fellipe'),
  ('Felipe Felix'),
  ('Rodrigo Massi'),
  ('Alex Sakaki')
on conflict (nome) do nothing;
