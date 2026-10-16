-- New role titles for the three founding members. Only role_title changes;
-- about, photo, order and visibility stay as they are. Matched by name and
-- category, so running it again changes nothing.

begin;

update org_people as p
set role_title = v.role_title
from (values
  ('Pranjal Srivastav', 'Founding Member, Head of Strategy & Technology'),
  ('Anshika Dwivedi', 'Founding Member, Head of Network & Innovation Operations'),
  ('Sirin Bano', 'Founding Member, Head of Research & Development')
) as v (full_name, role_title)
where p.full_name = v.full_name
  and p.category = 'founder'
  and p.role_title is distinct from v.role_title;

commit;
