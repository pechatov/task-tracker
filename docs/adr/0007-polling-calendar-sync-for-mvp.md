# Polling calendar sync for MVP

Calendar synchronization in the MVP will use scheduled polling plus a manual resync action instead of provider webhooks. This is simpler to operate on a personal self-hosted server, keeps the public network surface smaller, and still allows provider-specific incremental sync state to be stored so webhooks can be added later if polling becomes too slow or inefficient.
