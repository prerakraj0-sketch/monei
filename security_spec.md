# Firestore Security Specification

## 1. Data Invariants
1. Every document in `/users/{userId}` and its subcollections (`stocks`, `cashAccounts`, `expenses`, `deals`) belongs exclusively to the verified authenticated user matching `{userId}` (`request.auth.uid == userId && request.auth.token.email_verified == true`).
2. Every subcollection document must verify `exists(/databases/$(database)/documents/users/$(userId))` on creation or allow the user profile owner gate, and enforce `ownerId == request.auth.uid` and `id == docId`.
3. `createdAt` and `updatedAt` must equal `request.time` on creation; `createdAt`, `id`, and `ownerId` are immutable on update; `updatedAt` must equal `request.time` on update.
4. No shadow/extra fields are permitted (`hasOnly` enforced on both `create` and `affectedKeys()` on `update`).
5. All string fields enforce explicit `.size()` bounds; all IDs enforce `^[a-zA-Z0-9_\-]+$`.
6. Once an `ImportantDeal` reaches terminal stage `closed`, no further updates are allowed.
7. List queries on subcollections enforce `resource.data.ownerId == request.auth.uid` with zero `get()`/`exists()` calls.

## 2. Dirty Dozen Attack Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Read/Write**: Unauthenticated user attempts `get` or `create` on `/users/userA/stocks/s1`.
2. **Cross-Tenant Access**: Authenticated `userB` attempts to `list` or `get` `/users/userA/cashAccounts`.
3. **Unverified Email Spoof**: Authenticated user with `email_verified: false` attempts to `create` `/users/userA/deals/d1`.
4. **OwnerId Spoofing on Create**: `userA` creates `/users/userA/stocks/s1` with `ownerId: "userB"`.
5. **Shadow Field Injection on Create**: `userA` creates `/users/userA/cashAccounts/c1` with extra field `isAdmin: true`.
6. **Shadow Field Injection on Update**: `userA` updates `/users/userA/expenses/e1` with extra field `approvedBy: "system"`.
7. **ID Poisoning**: `userA` creates `/users/userA/stocks/invalid..id!` or with `id` field not matching document ID.
8. **Type / Boundary Poisoning**: `userA` creates `/users/userA/stocks/s1` with `shares: -5` or `notes` length > 300.
9. **Client Timestamp Forgery**: `userA` creates `/users/userA/expenses/e1` with `createdAt` set to a past client timestamp instead of `request.time`.
10. **Immutable Field Mutation**: `userA` updates `/users/userA/deals/d1` attempting to modify `createdAt` or `ownerId`.
11. **Terminal State Bypass**: `userA` updates `/users/userA/deals/d1` after `existing().stage == "closed"`.
12. **Blanket Root Query**: Authenticated `userA` attempts `list` on `/users` collection.
