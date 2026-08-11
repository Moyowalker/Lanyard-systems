# Storefront Catalog Visibility

A medicine appears in the customer storefront only when all of the following are true:

1. Its product status is `PUBLISHED`.
2. The selected branch has a branch-price row for the product.
3. That price row is marked `isAvailable: true`.

Stock quantity does not hide a medicine. A priced, available product with no stock still appears with an out-of-stock label and cannot be added to the cart.

For a report of a missing medicine, check the product status and the selected branch's price row before treating it as a catalog pagination issue. The public catalog applies branch-price and availability filtering before cursor pagination, so only eligible medicines are counted and paged.