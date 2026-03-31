"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Bike, Phone, Upload, User } from "lucide-react";

import supabase, { isConfigured } from "@/src/lib/supabaseClient";

function normalizePhone(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\s()-]/g, "")
    .replace(/^\+/, "0")
    .replace(/^0+/, "0")
    .trim();
}

function formatElapsedTime(createdAt, nowMs) {
  if (!createdAt || !nowMs) return "--";
  const start = new Date(createdAt).getTime();
  if (Number.isNaN(start)) return "--";

  const totalSeconds = Math.max(0, Math.floor((nowMs - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatCustomerId(id) {
  return String(id ?? "")
    .replaceAll("-", "")
    .slice(0, 8)
    .toUpperCase();
}

function customerIdImageDataUri(id) {
  const shortId = formatCustomerId(id) || "UNKNOWN";
  const color = `#${(shortId + "000000").slice(0, 6)}`;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="12" fill="${color}" />
      <text x="32" y="37" text-anchor="middle" font-size="14" fill="#ffffff" font-family="Arial, sans-serif">${shortId.slice(
        0,
        4
      )}</text>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function toDashboardError(err, fallbackMessage) {
  const raw = err?.message ? String(err.message) : "";
  if (raw.toLowerCase().includes("could not find the table 'public.customers'")) {
    return "Supabase table missing: run supabase/migrations/20260331_create_customers_table.sql in your Supabase SQL Editor.";
  }
  if (raw.toLowerCase().includes("customer_id") || raw.toLowerCase().includes("customer_id_image")) {
    return "Missing DB columns: run supabase/migrations/20260331_add_customer_identity_fields.sql in Supabase SQL Editor.";
  }
  if (raw.toLowerCase().includes("is_blocked")) {
    return "Missing DB columns: run supabase/migrations/20260331_add_blocked_flag.sql in Supabase SQL Editor.";
  }
  if (
    raw.toLowerCase().includes("row-level security") ||
    raw.toLowerCase().includes("permission denied") ||
    raw.toLowerCase().includes("not allowed")
  ) {
    return "Supabase policy blocks this action. Run supabase/migrations/20260331_fix_customers_auth_policies.sql in Supabase SQL Editor.";
  }
  return raw || fallbackMessage;
}

export default function Dashboard() {
  const nameInputRef = useRef(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [bikeId, setBikeId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerIdImage, setCustomerIdImage] = useState("");

  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [customerIdError, setCustomerIdError] = useState("");
  const [submitError, setSubmitError] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [endingRentalId, setEndingRentalId] = useState("");
  const [isLoadingRentals, setIsLoadingRentals] = useState(true);
  const [activeRentals, setActiveRentals] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [allCustomersSearch, setAllCustomersSearch] = useState("");
  const [mounted, setMounted] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const [previewImage, setPreviewImage] = useState("");
  const [previewTitle, setPreviewTitle] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedBikeId, setSelectedBikeId] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const loadActiveRentals = useCallback(async () => {
    if (!isConfigured || !supabase) {
      setIsLoadingRentals(false);
      setSubmitError("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      setActiveRentals([]);
      return;
    }
    try {
      setIsLoadingRentals(true);
      setSubmitError("");

      const { data, error } = await supabase
        .from("customers")
        .select("id, created_at, name, phone, bike_id, customer_id, customer_id_image, is_blocked")
        .eq("status", true)
        .eq("is_blocked", false)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setActiveRentals(data ?? []);
    } catch (err) {
      setSubmitError(toDashboardError(err, "Failed to load active rentals."));
      setActiveRentals([]);
    } finally {
      setIsLoadingRentals(false);
    }
  }, []);

  const loadAllCustomers = useCallback(async () => {
    if (!isConfigured || !supabase) {
      setAllCustomers([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("id, created_at, name, phone, bike_id, customer_id, customer_id_image, status, is_blocked")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAllCustomers(data ?? []);
    } catch {
      setAllCustomers([]);
    }
  }, []);

  useEffect(() => {
    // Ensure ultra-fast flow: start typing immediately.
    nameInputRef.current?.focus();
  }, []);

  useEffect(() => {
    setMounted(true);
    setNowMs(Date.now());
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Initial load + live updates.
    loadActiveRentals();
    loadAllCustomers();

    if (!isConfigured || !supabase) return;

    const channel = supabase
      .channel("customers-active-rentals")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        () => {
          // Simple + robust: refresh list on any change.
          loadActiveRentals();
          loadAllCustomers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadActiveRentals, loadAllCustomers]);

  const quickAddDisabled = useMemo(() => isSubmitting, [isSubmitting]);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const normalizedAllCustomersSearch = allCustomersSearch.trim().toLowerCase();

  const filteredActiveRentals = useMemo(() => {
    if (!normalizedSearch) return activeRentals;
    return activeRentals.filter((row) => {
      const nameValue = String(row.name ?? "").toLowerCase();
      const phoneValue = String(row.phone ?? "").toLowerCase();
      const bikeValue = String(row.bike_id ?? "").toLowerCase();
      return (
        nameValue.includes(normalizedSearch) ||
        phoneValue.includes(normalizedSearch) ||
        bikeValue.includes(normalizedSearch)
      );
    });
  }, [activeRentals, normalizedSearch]);

  const filteredAllCustomers = useMemo(() => {
    if (!normalizedAllCustomersSearch) return allCustomers;
    return allCustomers.filter((row) => {
      const nameValue = String(row.name ?? "").toLowerCase();
      const phoneValue = String(row.phone ?? "").toLowerCase();
      const bikeValue = String(row.bike_id ?? "").toLowerCase();
      const customerIdValue = String(row.customer_id ?? "").toLowerCase();
      return (
        nameValue.includes(normalizedAllCustomersSearch) ||
        phoneValue.includes(normalizedAllCustomersSearch) ||
        bikeValue.includes(normalizedAllCustomersSearch) ||
        customerIdValue.includes(normalizedAllCustomersSearch)
      );
    });
  }, [allCustomers, normalizedAllCustomersSearch]);

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitError("");

    if (!isConfigured || !supabase) {
      setSubmitError("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }

    const trimmedName = name.trim();
    const normalizedPhone = normalizePhone(phone);
    const trimmedBikeId = bikeId.trim();
    const trimmedCustomerId = customerId.trim();

    let hasError = false;
    if (!trimmedName) {
      setNameError("Name is required.");
      hasError = true;
      nameInputRef.current?.focus();
    } else {
      setNameError("");
    }

    // Basic validation: phone must not be empty.
    if (!normalizedPhone) {
      setPhoneError("Phone number is required.");
      hasError = true;
    } else {
      setPhoneError("");
    }

    if (!trimmedCustomerId) {
      setCustomerIdError("Customer ID is required.");
      hasError = true;
    } else {
      setCustomerIdError("");
    }

    if (hasError) return;

    try {
      setIsSubmitting(true);

      const payload = {
        name: trimmedName,
        phone: normalizedPhone,
        bike_id: trimmedBikeId,
        customer_id: trimmedCustomerId,
        customer_id_image: customerIdImage || null,
        status: true,
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("customers").insert(payload);
      if (error) throw error;

      // Clear only the entry fields; the list will refresh via realtime.
      setName("");
      setPhone("");
      setBikeId("");
      setCustomerId("");
      setCustomerIdImage("");

      // Keep the flow fast for the next customer.
      setTimeout(() => nameInputRef.current?.focus(), 0);
      await loadAllCustomers();
    } catch (err) {
      setSubmitError(toDashboardError(err, "Failed to add customer."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onEndRental(rentalId) {
    if (!isConfigured || !supabase || !rentalId) return;
    try {
      setSubmitError("");
      setEndingRentalId(rentalId);
      const { error } = await supabase
        .from("customers")
        .update({ status: false })
        .eq("id", rentalId);

      if (error) throw error;
      await loadActiveRentals();
      await loadAllCustomers();
    } catch (err) {
      setSubmitError(toDashboardError(err, "Failed to end rental."));
    } finally {
      setEndingRentalId("");
    }
  }

  function onCustomerIdImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) {
      setCustomerIdImage("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      setCustomerIdImage(value);
    };
    reader.readAsDataURL(file);
  }

  function openImagePreview(imageSrc, title) {
    if (!imageSrc) return;
    setPreviewImage(imageSrc);
    setPreviewTitle(title || "Customer ID Image");
  }

  function onOpenCustomerActions(row) {
    setSelectedCustomer(row);
    setSelectedBikeId(row.bike_id || "");
  }

  async function onStartRentAgain() {
    if (!selectedCustomer?.id || !supabase) return;
    try {
      setActionLoading(true);
      setSubmitError("");
      const { error } = await supabase
        .from("customers")
        .update({
          status: true,
          bike_id: selectedBikeId.trim() || selectedCustomer.bike_id || "",
          is_blocked: false,
          created_at: new Date().toISOString(),
        })
        .eq("id", selectedCustomer.id);
      if (error) throw error;
      setSelectedCustomer(null);
      await loadActiveRentals();
      await loadAllCustomers();
    } catch (err) {
      setSubmitError(toDashboardError(err, "Failed to restart rental."));
    } finally {
      setActionLoading(false);
    }
  }

  async function onBlockUser() {
    if (!selectedCustomer?.id || !supabase) return;
    try {
      setActionLoading(true);
      setSubmitError("");
      const { error } = await supabase
        .from("customers")
        .update({
          is_blocked: true,
          status: false,
        })
        .eq("id", selectedCustomer.id);
      if (error) throw error;
      setSelectedCustomer(null);
      await loadActiveRentals();
      await loadAllCustomers();
    } catch (err) {
      setSubmitError(toDashboardError(err, "Failed to block user."));
    } finally {
      setActionLoading(false);
    }
  }

  async function onUnblockUser() {
    if (!selectedCustomer?.id || !supabase) return;
    try {
      setActionLoading(true);
      setSubmitError("");
      const { error } = await supabase
        .from("customers")
        .update({
          is_blocked: false,
        })
        .eq("id", selectedCustomer.id);
      if (error) throw error;
      setSelectedCustomer((prev) => (prev ? { ...prev, is_blocked: false } : prev));
      await loadActiveRentals();
      await loadAllCustomers();
    } catch (err) {
      setSubmitError(toDashboardError(err, "Failed to unblock user."));
    } finally {
      setActionLoading(false);
    }
  }

  async function onDeleteCustomer() {
    if (!selectedCustomer?.id || !supabase) return;
    const ok = window.confirm("Delete this customer permanently?");
    if (!ok) return;
    try {
      setActionLoading(true);
      setSubmitError("");
      const { error } = await supabase.from("customers").delete().eq("id", selectedCustomer.id);
      if (error) throw error;
      setSelectedCustomer(null);
      await loadActiveRentals();
      await loadAllCustomers();
    } catch (err) {
      setSubmitError(toDashboardError(err, "Failed to delete customer."));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Bike Rental Fast-Entry</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Quick-add a customer and instantly see active rentals update in real time.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-right">
            <div className="text-xs text-zinc-400">Active rentals</div>
            <div className="text-lg font-semibold">{activeRentals.length}</div>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-zinc-300">Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  ref={nameInputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ahmed"
                  className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-10 pr-3 text-sm outline-none ring-0 placeholder:text-zinc-600 focus:border-zinc-700 focus:ring-2 focus:ring-zinc-700"
                  aria-label="Name"
                />
              </div>
              {nameError ? <div className="mt-1 text-xs text-red-400">{nameError}</div> : null}
            </div>

            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-zinc-300">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 0123456789"
                  inputMode="tel"
                  type="tel"
                  className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-10 pr-3 text-sm outline-none ring-0 placeholder:text-zinc-600 focus:border-zinc-700 focus:ring-2 focus:ring-zinc-700"
                  aria-label="Phone Number"
                />
              </div>
              {phoneError ? <div className="mt-1 text-xs text-red-400">{phoneError}</div> : null}
            </div>

            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-zinc-300">Customer ID</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  placeholder="e.g. CUST-1007"
                  className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-10 pr-3 text-sm outline-none ring-0 placeholder:text-zinc-600 focus:border-zinc-700 focus:ring-2 focus:ring-zinc-700"
                  aria-label="Customer ID"
                />
              </div>
              {customerIdError ? (
                <div className="mt-1 text-xs text-red-400">{customerIdError}</div>
              ) : null}
            </div>

            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-zinc-300">Customer ID Image</label>
              <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 transition hover:border-zinc-700">
                <Upload className="h-4 w-4 text-zinc-400" />
                <span className="truncate">
                  {customerIdImage ? "Image selected" : "Upload ID image"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={onCustomerIdImageChange}
                  className="hidden"
                  aria-label="Customer ID Image Upload"
                />
              </label>
            </div>

            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-zinc-300">Bike ID</label>
              <div className="relative">
                <Bike className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  value={bikeId}
                  onChange={(e) => setBikeId(e.target.value)}
                  placeholder="e.g. B-104"
                  className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-10 pr-3 text-sm outline-none ring-0 placeholder:text-zinc-600 focus:border-zinc-700 focus:ring-2 focus:ring-zinc-700"
                  aria-label="Bike ID"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={quickAddDisabled}
              className="h-11 rounded-xl bg-zinc-50 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Adding..." : "Quick Add"}
            </button>
          </div>

          {submitError ? (
            <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
              {submitError}
            </div>
          ) : null}
        </form>

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-200">Active Rentals</h2>
          <div className="flex items-center gap-3">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search customer, phone, bike..."
              className="h-9 w-64 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-xs text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-zinc-700 focus:ring-2 focus:ring-zinc-700"
              aria-label="Search Customer"
            />
            {isLoadingRentals ? <div className="text-xs text-zinc-400">Loading...</div> : null}
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/30">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-950/60 text-xs uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-4 py-3">ID Image</th>
                  <th className="px-4 py-3">Customer ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Bike ID</th>
                  <th className="px-4 py-3">Rent Timer</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredActiveRentals.length === 0 && !isLoadingRentals ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                      {normalizedSearch ? "No matching customers found." : "No active rentals yet."}
                    </td>
                  </tr>
                ) : null}

                {filteredActiveRentals.map((row) => {
                  const created = row.created_at ? new Date(row.created_at).toLocaleString() : "";
                  const elapsed = mounted ? formatElapsedTime(row.created_at, nowMs) : "--";
                  const isEndingThisRow = endingRentalId === row.id;
                  const shortId = row.customer_id || formatCustomerId(row.id);
                  const idImg = row.customer_id_image || customerIdImageDataUri(row.id);
                  return (
                    <tr key={row.id} className="border-t border-zinc-800/60 hover:bg-zinc-950/30">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openImagePreview(idImg, `Customer ${shortId}`)}
                          className="rounded-lg border border-zinc-700 transition hover:border-zinc-500"
                          aria-label={`Open ID image for ${shortId}`}
                        >
                          <Image
                            src={idImg}
                            alt={`Customer ${shortId}`}
                            width={40}
                            height={40}
                            className="h-10 w-10 rounded-lg"
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-300">{shortId}</td>
                      <td className="px-4 py-3 font-medium text-zinc-100">{row.name}</td>
                      <td className="px-4 py-3 text-zinc-300">{row.phone}</td>
                      <td className="px-4 py-3 text-zinc-300">{row.bike_id}</td>
                      <td className="px-4 py-3 font-mono text-zinc-200">{elapsed}</td>
                      <td className="px-4 py-3 text-zinc-500">{created}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onEndRental(row.id)}
                          disabled={isEndingThisRow}
                          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isEndingThisRow ? "Ending..." : "End Rent"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-200">All Customers (Saved)</h2>
          <div className="flex items-center gap-3">
            <input
              value={allCustomersSearch}
              onChange={(e) => setAllCustomersSearch(e.target.value)}
              placeholder="Search all customers..."
              className="h-9 w-64 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-xs text-zinc-200 outline-none placeholder:text-zinc-500 focus:border-zinc-700 focus:ring-2 focus:ring-zinc-700"
              aria-label="Search All Customers"
            />
            <div className="text-xs text-zinc-400">{allCustomers.length} total</div>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/30">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-950/60 text-xs uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-4 py-3">ID Image</th>
                  <th className="px-4 py-3">Customer ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Bike ID</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredAllCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                      No customers saved yet.
                    </td>
                  </tr>
                ) : null}

                {filteredAllCustomers.map((row) => {
                  const created = row.created_at ? new Date(row.created_at).toLocaleString() : "";
                  const isActive = Boolean(row.status);
                  const shortId = row.customer_id || formatCustomerId(row.id);
                  const idImg = row.customer_id_image || customerIdImageDataUri(row.id);
                  return (
                    <tr
                      key={`all-${row.id}`}
                      onClick={() => onOpenCustomerActions(row)}
                      className="cursor-pointer border-t border-zinc-800/60 hover:bg-zinc-950/30"
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openImagePreview(idImg, `Customer ${shortId}`)}
                          className="rounded-lg border border-zinc-700 transition hover:border-zinc-500"
                          aria-label={`Open ID image for ${shortId}`}
                        >
                          <Image
                            src={idImg}
                            alt={`Customer ${shortId}`}
                            width={40}
                            height={40}
                            className="h-10 w-10 rounded-lg"
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-300">{shortId}</td>
                      <td className="px-4 py-3 font-medium text-zinc-100">{row.name}</td>
                      <td className="px-4 py-3 text-zinc-300">{row.phone}</td>
                      <td className="px-4 py-3 text-zinc-300">{row.bike_id}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            row.is_blocked
                              ? "bg-red-950/40 text-red-300"
                              : isActive
                                ? "bg-emerald-900/30 text-emerald-300"
                                : "bg-zinc-800 text-zinc-300"
                          }`}
                        >
                          {row.is_blocked ? "Blocked" : isActive ? "Active" : "Ended"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500">{created}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {previewImage ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-zinc-700 bg-zinc-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">{previewTitle}</h3>
              <button
                type="button"
                onClick={() => setPreviewImage("")}
                className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                Close
              </button>
            </div>
            <div className="overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 p-2">
              <Image
                src={previewImage}
                alt={previewTitle || "Customer ID preview"}
                width={900}
                height={600}
                className="h-auto max-h-[70vh] w-full rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}

      {selectedCustomer ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">Customer Actions</h3>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                Close
              </button>
            </div>

            <div className="space-y-2 text-sm text-zinc-300">
              <div>
                <span className="text-zinc-500">Customer: </span>
                {selectedCustomer.name}
              </div>
              <div>
                <span className="text-zinc-500">Phone: </span>
                {selectedCustomer.phone}
              </div>
              <div>
                <span className="text-zinc-500">Customer ID: </span>
                {selectedCustomer.customer_id || formatCustomerId(selectedCustomer.id)}
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-zinc-300">Bike ID</label>
              <input
                value={selectedBikeId}
                onChange={(e) => setSelectedBikeId(e.target.value)}
                className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm outline-none placeholder:text-zinc-600 focus:border-zinc-700 focus:ring-2 focus:ring-zinc-700"
                placeholder="Set bike ID for restart rent"
              />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={onStartRentAgain}
                disabled={actionLoading || Boolean(selectedCustomer.is_blocked)}
                className="h-10 rounded-xl bg-zinc-50 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Start Rent Again
              </button>
              <button
                type="button"
                onClick={onBlockUser}
                disabled={actionLoading || Boolean(selectedCustomer.is_blocked)}
                className="h-10 rounded-xl border border-red-700 bg-red-950/40 px-4 text-sm font-semibold text-red-200 transition hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Block User
              </button>
              <button
                type="button"
                onClick={onUnblockUser}
                disabled={actionLoading || !Boolean(selectedCustomer.is_blocked)}
                className="h-10 rounded-xl border border-emerald-700 bg-emerald-950/30 px-4 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Unblock User
              </button>
              <button
                type="button"
                onClick={onDeleteCustomer}
                disabled={actionLoading}
                className="h-10 rounded-xl border border-red-700 bg-red-900/50 px-4 text-sm font-semibold text-red-100 transition hover:bg-red-800/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Delete Customer
              </button>
            </div>
            {selectedCustomer.is_blocked ? (
              <div className="mt-3 text-xs text-red-300">
                This customer is blocked. Start Rent Again is disabled.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

