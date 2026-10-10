-- Admin v2, step 1 of 4.
-- Run order: 0007 -> 0008 -> 0009 -> 0010.
--
-- A new enum value cannot be used in the transaction that adds it, so it gets
-- a file of its own and must be run before 0008.

alter type event_status add value if not exists 'cancelled';
