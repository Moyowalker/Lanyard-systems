'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoryDto, Paginated } from '@lanyard/contracts';
import {
  CreateCategorySchema,
  CreateProductSchema,
  ProductForm,
  ProductStatus,
  RegulatoryClass,
  UpdateProductSchema,
} from '@lanyard/contracts';

import { IconAlert, IconCatalog, IconCheck, IconClock, IconRx } from '@/components/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Panel,
  Skeleton,
  Spinner,
  StatCard,
  TableCard,
  Td,
  Th,
  cn,
} from '@/components/ui';

type AdminProductRow = {
  id: string;
  name: string;
  slug: string;
  genericName?: string;
  brand?: string;
  description?: string;
  form?: string;
  strength?: string;
  packSize?: string;
  categoryIds?: string[];
  regulatoryClass?: string;
  requiresPrescription?: boolean;
  status?: string;
  manufacturer?: string;
  nafdacRegNo?: string;
};

type ProductFormState = {
  id?: string;
  name: string;
  slug: string;
  genericName: string;
  brand: string;
  description: string;
  form: ProductForm;
  strength: string;
  packSize: string;
  regulatoryClass: RegulatoryClass;
  status: ProductStatus;
  manufacturer: string;
  nafdacRegNo: string;
  categoryIds: string[];
};

type CategoryFormState = {
  name: string;
  slug: string;
  parentId: string;
  displayOrder: string;
  isActive: boolean;
};

type FormMessage = { tone: 'success' | 'danger'; text: string };

const EMPTY_PRODUCT_FORM: ProductFormState = {
  name: '',
  slug: '',
  genericName: '',
  brand: '',
  description: '',
  form: ProductForm.TABLET,
  strength: '',
  packSize: '',
  regulatoryClass: RegulatoryClass.OTC,
  status: ProductStatus.DRAFT,
  manufacturer: '',
  nafdacRegNo: '',
  categoryIds: [],
};

const EMPTY_CATEGORY_FORM: CategoryFormState = {
  name: '',
  slug: '',
  parentId: '',
  displayOrder: '0',
  isActive: true,
};

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

function humanizeToken(value?: string): string {
  if (!value) return 'Unknown';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function productStatusTone(status?: string): 'success' | 'warn' | 'neutral' {
  if (status === ProductStatus.PUBLISHED) return 'success';
  if (status === ProductStatus.DRAFT) return 'warn';
  return 'neutral';
}

function InlineNotice({ message }: { message?: FormMessage }) {
  if (!message) return null;
  return (
    <p
      className={
        message.tone === 'success'
          ? 'rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700'
          : 'rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700'
      }
    >
      {message.text}
    </p>
  );
}

function toProductForm(product: AdminProductRow): ProductFormState {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    genericName: product.genericName ?? '',
    brand: product.brand ?? '',
    description: product.description ?? '',
    form: (product.form as ProductForm | undefined) ?? ProductForm.TABLET,
    strength: product.strength ?? '',
    packSize: product.packSize ?? '',
    regulatoryClass:
      (product.regulatoryClass as RegulatoryClass | undefined) ?? RegulatoryClass.OTC,
    status: (product.status as ProductStatus | undefined) ?? ProductStatus.DRAFT,
    manufacturer: product.manufacturer ?? '',
    nafdacRegNo: product.nafdacRegNo ?? '',
    categoryIds: product.categoryIds ?? [],
  };
}

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [productForm, setProductForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(EMPTY_CATEGORY_FORM);
  const [productMessage, setProductMessage] = useState<FormMessage>();
  const [categoryMessage, setCategoryMessage] = useState<FormMessage>();

  const productsQ = useQuery({
    queryKey: ['admin-products'],
    queryFn: async () => {
      const res = await fetch('/api/admin/catalog/products?limit=100');
      if (!res.ok) throw new Error('Failed to load products');
      return (await res.json()) as Paginated<AdminProductRow>;
    },
  });

  const categoriesQ = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: async () => {
      const res = await fetch('/api/catalog/categories');
      if (!res.ok) throw new Error('Failed to load categories');
      return (await res.json()) as { data: CategoryDto[] };
    },
  });

  const rows = productsQ.data?.data ?? [];
  const categories = categoriesQ.data?.data ?? [];
  const selectedProduct = useMemo(
    () => rows.find((row) => row.id === productForm.id),
    [productForm.id, rows],
  );
  const publishedCount = rows.filter((row) => row.status === ProductStatus.PUBLISHED).length;
  const draftCount = rows.filter((row) => row.status === ProductStatus.DRAFT).length;
  const prescriptionCount = rows.filter((row) => row.requiresPrescription).length;

  const productMutation = useMutation({
    mutationFn: async (payload: { mode: 'create' | 'update'; body: unknown; id?: string }) => {
      const url =
        payload.mode === 'create'
          ? '/api/admin/catalog/products'
          : `/api/admin/catalog/products/${payload.id}`;
      const method = payload.mode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload.body),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? 'Product save failed');
      return body;
    },
    onSuccess: async (_body, variables) => {
      setProductMessage({
        tone: 'success',
        text: variables.mode === 'create' ? 'Product created.' : 'Product updated.',
      });
      if (variables.mode === 'create') {
        setProductForm(EMPTY_PRODUCT_FORM);
      }
      await queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    },
    onError: (error) => {
      setProductMessage({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Product save failed',
      });
    },
  });

  const categoryMutation = useMutation({
    mutationFn: async (payload: unknown) => {
      const res = await fetch('/api/admin/catalog/categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? 'Category creation failed');
      return body;
    },
    onSuccess: async () => {
      setCategoryMessage({ tone: 'success', text: 'Category created.' });
      setCategoryForm(EMPTY_CATEGORY_FORM);
      await queryClient.invalidateQueries({ queryKey: ['catalog-categories'] });
    },
    onError: (error) => {
      setCategoryMessage({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Category creation failed',
      });
    },
  });

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProductMessage(undefined);
    const payload = {
      name: productForm.name,
      slug: productForm.slug || undefined,
      genericName: productForm.genericName || undefined,
      brand: productForm.brand || undefined,
      description: productForm.description || undefined,
      form: productForm.form,
      strength: productForm.strength || undefined,
      packSize: productForm.packSize || undefined,
      categoryIds: productForm.categoryIds,
      regulatoryClass: productForm.regulatoryClass,
      nafdacRegNo: productForm.nafdacRegNo || undefined,
      manufacturer: productForm.manufacturer || undefined,
      status: productForm.status,
    };

    const parsed = productForm.id
      ? UpdateProductSchema.safeParse(payload)
      : CreateProductSchema.safeParse(payload);
    if (!parsed.success) {
      setProductMessage({
        tone: 'danger',
        text: parsed.error.issues[0]?.message ?? 'Check the product form.',
      });
      return;
    }

    await productMutation.mutateAsync({
      mode: productForm.id ? 'update' : 'create',
      body: parsed.data,
      id: productForm.id,
    });
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCategoryMessage(undefined);

    const parsed = CreateCategorySchema.safeParse({
      name: categoryForm.name,
      slug: categoryForm.slug || undefined,
      parentId: categoryForm.parentId || undefined,
      displayOrder: Number(categoryForm.displayOrder || 0),
      isActive: categoryForm.isActive,
    });
    if (!parsed.success) {
      setCategoryMessage({
        tone: 'danger',
        text: parsed.error.issues[0]?.message ?? 'Check the category form.',
      });
      return;
    }

    await categoryMutation.mutateAsync(parsed.data);
  }

  return (
    <div>
      <PageHeader
        title="Catalog"
        subtitle="Create categories, publish products, and keep regulated metadata current"
        actions={
          <Button variant="secondary" onClick={() => setProductForm(EMPTY_PRODUCT_FORM)}>
            New product
          </Button>
        }
      />

      {productsQ.isLoading ? (
        <Card className="p-5">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : productsQ.isError ? (
        <Card>
          <EmptyState
            title="Could not load products"
            description="The admin catalog API is available, but the console could not reach it."
            icon={IconAlert}
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Catalog SKUs" value={rows.length} icon={IconCatalog} tone="brand" />
            <StatCard label="Published" value={publishedCount} icon={IconCheck} tone="sky" />
            <StatCard label="Draft" value={draftCount} icon={IconClock} tone="amber" />
            <StatCard label="Prescription products" value={prescriptionCount} icon={IconRx} tone="rose" />
          </div>

          <div className="mb-6 grid gap-4 xl:grid-cols-[1.8fr_1fr]">
            <Panel
              title={productForm.id ? 'Update product' : 'Create product'}
              subtitle="Global catalog management for OTC and regulated products"
            >
              <form className="space-y-4" onSubmit={submitProduct}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor="product-name">
                      Name
                    </label>
                    <input
                      id="product-name"
                      value={productForm.name}
                      onChange={(event) =>
                        setProductForm((current) => ({ ...current, name: event.target.value }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="product-slug">
                      Slug
                    </label>
                    <input
                      id="product-slug"
                      value={productForm.slug}
                      onChange={(event) =>
                        setProductForm((current) => ({ ...current, slug: event.target.value }))
                      }
                      className={inputClass}
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className={labelClass} htmlFor="product-generic">
                      Generic name
                    </label>
                    <input
                      id="product-generic"
                      value={productForm.genericName}
                      onChange={(event) =>
                        setProductForm((current) => ({ ...current, genericName: event.target.value }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="product-brand">
                      Brand
                    </label>
                    <input
                      id="product-brand"
                      value={productForm.brand}
                      onChange={(event) =>
                        setProductForm((current) => ({ ...current, brand: event.target.value }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="product-form">
                      Form
                    </label>
                    <select
                      id="product-form"
                      value={productForm.form}
                      onChange={(event) =>
                        setProductForm((current) => ({
                          ...current,
                          form: event.target.value as ProductForm,
                        }))
                      }
                      className={inputClass}
                    >
                      {Object.values(ProductForm).map((value) => (
                        <option key={value} value={value}>
                          {humanizeToken(value)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="product-strength">
                      Strength
                    </label>
                    <input
                      id="product-strength"
                      value={productForm.strength}
                      onChange={(event) =>
                        setProductForm((current) => ({ ...current, strength: event.target.value }))
                      }
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className={labelClass} htmlFor="product-pack-size">
                      Pack size
                    </label>
                    <input
                      id="product-pack-size"
                      value={productForm.packSize}
                      onChange={(event) =>
                        setProductForm((current) => ({ ...current, packSize: event.target.value }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="product-reg-class">
                      Regulatory class
                    </label>
                    <select
                      id="product-reg-class"
                      value={productForm.regulatoryClass}
                      onChange={(event) =>
                        setProductForm((current) => ({
                          ...current,
                          regulatoryClass: event.target.value as RegulatoryClass,
                        }))
                      }
                      className={inputClass}
                    >
                      {Object.values(RegulatoryClass).map((value) => (
                        <option key={value} value={value}>
                          {humanizeToken(value)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="product-status">
                      Publish state
                    </label>
                    <select
                      id="product-status"
                      value={productForm.status}
                      onChange={(event) =>
                        setProductForm((current) => ({
                          ...current,
                          status: event.target.value as ProductStatus,
                        }))
                      }
                      className={inputClass}
                    >
                      {Object.values(ProductStatus).map((value) => (
                        <option key={value} value={value}>
                          {humanizeToken(value)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="product-nafdac">
                      NAFDAC reg. no.
                    </label>
                    <input
                      id="product-nafdac"
                      value={productForm.nafdacRegNo}
                      onChange={(event) =>
                        setProductForm((current) => ({ ...current, nafdacRegNo: event.target.value }))
                      }
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass} htmlFor="product-manufacturer">
                    Manufacturer
                  </label>
                  <input
                    id="product-manufacturer"
                    value={productForm.manufacturer}
                    onChange={(event) =>
                      setProductForm((current) => ({ ...current, manufacturer: event.target.value }))
                    }
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass} htmlFor="product-description">
                    Description
                  </label>
                  <textarea
                    id="product-description"
                    value={productForm.description}
                    onChange={(event) =>
                      setProductForm((current) => ({ ...current, description: event.target.value }))
                    }
                    className={cn(inputClass, 'min-h-24')}
                  />
                </div>

                <div>
                  <div className={labelClass}>Categories</div>
                  {categoriesQ.isLoading ? (
                    <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                      <Spinner /> Loading categories...
                    </div>
                  ) : categoriesQ.isError ? (
                    <p className="mt-2 text-sm text-rose-600">Category lookup unavailable.</p>
                  ) : categories.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">Create a category first.</p>
                  ) : (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {categories.map((category) => {
                        const checked = productForm.categoryIds.includes(category.id);
                        return (
                          <label
                            key={category.id}
                            className={cn(
                              'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                              checked
                                ? 'border-brand-300 bg-brand-50 text-brand-800'
                                : 'border-slate-200 bg-white text-slate-600',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setProductForm((current) => ({
                                  ...current,
                                  categoryIds: checked
                                    ? current.categoryIds.filter((id) => id !== category.id)
                                    : [...current.categoryIds, category.id],
                                }))
                              }
                            />
                            <span>{category.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedProduct ? (
                  <p className="text-xs text-slate-500">
                    Editing {selectedProduct.name}. Saving keeps the same product id unless you change the slug or metadata.
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">
                    Draft products stay hidden from the storefront until you mark them as published.
                  </p>
                )}

                <InlineNotice message={productMessage} />

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={productMutation.isPending}>
                    {productMutation.isPending ? (
                      <>
                        <Spinner className="h-4 w-4 border-white/40 border-t-white" /> Saving...
                      </>
                    ) : productForm.id ? (
                      'Update product'
                    ) : (
                      'Create product'
                    )}
                  </Button>
                  {productForm.id ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setProductForm(EMPTY_PRODUCT_FORM)}
                    >
                      Clear selection
                    </Button>
                  ) : null}
                </div>
              </form>
            </Panel>

            <Panel title="Create category" subtitle="Helper for product classification and storefront filtering">
              <form className="space-y-4" onSubmit={submitCategory}>
                <div>
                  <label className={labelClass} htmlFor="category-name">
                    Name
                  </label>
                  <input
                    id="category-name"
                    value={categoryForm.name}
                    onChange={(event) =>
                      setCategoryForm((current) => ({ ...current, name: event.target.value }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="category-slug">
                    Slug
                  </label>
                  <input
                    id="category-slug"
                    value={categoryForm.slug}
                    onChange={(event) =>
                      setCategoryForm((current) => ({ ...current, slug: event.target.value }))
                    }
                    className={inputClass}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="category-parent">
                    Parent category
                  </label>
                  <select
                    id="category-parent"
                    value={categoryForm.parentId}
                    onChange={(event) =>
                      setCategoryForm((current) => ({ ...current, parentId: event.target.value }))
                    }
                    className={inputClass}
                  >
                    <option value="">None</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="category-display-order">
                    Display order
                  </label>
                  <input
                    id="category-display-order"
                    type="number"
                    min="0"
                    step="1"
                    value={categoryForm.displayOrder}
                    onChange={(event) =>
                      setCategoryForm((current) => ({ ...current, displayOrder: event.target.value }))
                    }
                    className={inputClass}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={categoryForm.isActive}
                    onChange={(event) =>
                      setCategoryForm((current) => ({ ...current, isActive: event.target.checked }))
                    }
                  />
                  Active on storefront
                </label>
                <InlineNotice message={categoryMessage} />
                <Button type="submit" disabled={categoryMutation.isPending}>
                  {categoryMutation.isPending ? (
                    <>
                      <Spinner className="h-4 w-4 border-white/40 border-t-white" /> Saving...
                    </>
                  ) : (
                    'Create category'
                  )}
                </Button>
              </form>
            </Panel>
          </div>

          {rows.length === 0 ? (
            <Card>
              <EmptyState
                title="No products in the catalog"
                description="Use the product form above to create the first sellable SKU."
                icon={IconCatalog}
              />
            </Card>
          ) : (
            <TableCard>
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <Th>Product</Th>
                  <Th>Categories</Th>
                  <Th>Class</Th>
                  <Th>Prescription</Th>
                  <Th>Status</Th>
                  <Th>Slug</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const rowCategories = (row.categoryIds ?? [])
                    .map((id) => categories.find((category) => category.id === id)?.name)
                    .filter(Boolean)
                    .join(', ');
                  const active = productForm.id === row.id;

                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'cursor-pointer transition-colors hover:bg-slate-50/60',
                        active && 'bg-brand-50/60',
                      )}
                      onClick={() => {
                        setProductForm(toProductForm(row));
                        setProductMessage(undefined);
                      }}
                    >
                      <Td>
                        <div className="font-semibold text-slate-900">{row.name}</div>
                        <div className="text-xs text-slate-500">
                          {[row.genericName, row.brand, row.strength].filter(Boolean).join(' · ') ||
                            'No secondary descriptors'}
                        </div>
                      </Td>
                      <Td className="text-slate-500">{rowCategories || 'Unassigned'}</Td>
                      <Td>{humanizeToken(row.regulatoryClass)}</Td>
                      <Td>
                        <Badge tone={row.requiresPrescription ? 'warn' : 'info'}>
                          {row.requiresPrescription ? 'Required' : 'Not required'}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge tone={productStatusTone(row.status)}>{humanizeToken(row.status)}</Badge>
                      </Td>
                      <Td className="text-slate-500">/{row.slug}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableCard>
          )}
        </>
      )}
    </div>
  );
}
