An entity folder with no Entity.xml. Real exports contain leftover folders like
this; parseSolution must skip it rather than throw. The file exists only because
git will not track an empty directory.
