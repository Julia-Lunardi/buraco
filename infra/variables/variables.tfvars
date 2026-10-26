solution_name = "buraco"
location      = "northeurope"
min_replicas  = 0
max_replicas  = 1 # live tables: one process (backend/app/realtime.py)

# Shared with the woddie stack (like Salvie): no server or registry of our own.
shared_db_server_name     = "psql-woddie-de"
shared_db_resource_group  = "rg-woddie-de"
shared_acr_name           = "acrwoddiede"
shared_acr_resource_group = "rg-woddie-de"
cae_name                  = "cae-woddie-de"
cae_resource_group_name   = "rg-woddie-de"
