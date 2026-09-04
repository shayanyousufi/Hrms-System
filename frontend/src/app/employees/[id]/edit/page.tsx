"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { employeesApi, Employee } from "@/lib/employeeApi";

const departments = ["Engineering", "Design", "HR", "Finance", "Marketing", "Sales"];
const statuses = ["Active", "On Leave", "Inactive"];
const genders = ["Male", "Female", "Other"];

export default function EditEmployeePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    cnic: "",
    date_of_birth: "",
    gender: "",
    address: "",
    department: "",
    designation: "",
    reporting_manager: "",
    joining_date: "",
    employment_status: "",
    salary: "",
    bank_account: "",
  });

  useEffect(() => {
    async function load() {
      try {
        const emp = await employeesApi.get(id);
        setForm({
          first_name: emp.first_name,
          last_name: emp.last_name,
          email: emp.email,
          phone: emp.phone || "",
          cnic: emp.cnic || "",
          date_of_birth: emp.date_of_birth || "",
          gender: emp.gender || "",
          address: emp.address || "",
          department: emp.department,
          designation: emp.designation,
          reporting_manager: emp.reporting_manager || "",
          joining_date: emp.joining_date,
          employment_status: emp.employment_status,
          salary: emp.salary?.toString() || "",
          bank_account: emp.bank_account || "",
        });
      } catch {
        router.push("/employees");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const payload: Record<string, any> = {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        department: form.department,
        designation: form.designation,
        joining_date: form.joining_date,
        employment_status: form.employment_status,
      };

      if (form.phone) payload.phone = form.phone;
      if (form.cnic) payload.cnic = form.cnic;
      if (form.date_of_birth) payload.date_of_birth = form.date_of_birth;
      if (form.gender) payload.gender = form.gender;
      if (form.address) payload.address = form.address;
      if (form.reporting_manager) payload.reporting_manager = form.reporting_manager;
      if (form.salary) payload.salary = parseFloat(form.salary);
      if (form.bank_account) payload.bank_account = form.bank_account;

      await employeesApi.update(id, payload);
      setSuccess(true);
      setTimeout(() => router.push(`/employees/${id}`), 1500);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to update employee");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <Link href={`/employees/${id}`} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back to Employee
        </Link>

        <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Edit Employee</h1>
          <p className="text-sm text-gray-500 mb-6">Update employee information</p>

          {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl mb-4">{error}</div>}
          {success && <div className="bg-green-50 text-green-600 text-sm p-3 rounded-xl mb-4">Employee updated successfully! Redirecting...</div>}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Personal Info */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Personal Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="First Name *" name="first_name" value={form.first_name} onChange={handleChange} required />
                <Input label="Last Name *" name="last_name" value={form.last_name} onChange={handleChange} required />
                <Input label="Email *" name="email" type="email" value={form.email} onChange={handleChange} required />
                <Input label="Phone" name="phone" value={form.phone} onChange={handleChange} />
                <Input label="CNIC" name="cnic" value={form.cnic} onChange={handleChange} />
                <Input label="Date of Birth" name="date_of_birth" type="date" value={form.date_of_birth} onChange={handleChange} />
                <Select label="Gender" name="gender" value={form.gender} onChange={handleChange} options={["", ...genders]} />
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 font-medium mb-1.5">Address</label>
                  <textarea name="address" value={form.address} onChange={handleChange} rows={2} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-primary-400 transition-colors" />
                </div>
              </div>
            </div>

            {/* Employment Info */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Employment Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select label="Department *" name="department" value={form.department} onChange={handleChange} options={departments} />
                <Input label="Designation *" name="designation" value={form.designation} onChange={handleChange} required />
                <Input label="Reporting Manager" name="reporting_manager" value={form.reporting_manager} onChange={handleChange} />
                <Input label="Joining Date *" name="joining_date" type="date" value={form.joining_date} onChange={handleChange} required />
                <Select label="Status" name="employment_status" value={form.employment_status} onChange={handleChange} options={statuses} />
                <Input label="Salary (PKR)" name="salary" type="number" value={form.salary} onChange={handleChange} />
                <Input label="Bank Account" name="bank_account" value={form.bank_account} onChange={handleChange} />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving} className="bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors disabled:opacity-50">
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <Link href={`/employees/${id}`} className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Input({ label, name, type = "text", value, onChange, required = false }: {
  label: string; name: string; type?: string; value: string; onChange: any; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 font-medium mb-1.5">{label}</label>
      <input type={type} name={name} value={value} onChange={onChange} required={required} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-primary-400 transition-colors" />
    </div>
  );
}

function Select({ label, name, value, onChange, options }: {
  label: string; name: string; value: string; onChange: any; options: string[];
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 font-medium mb-1.5">{label}</label>
      <select name={name} value={value} onChange={onChange} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-primary-400 transition-colors">
        {options.map((o) => (
          <option key={o} value={o}>{o || `Select ${label}`}</option>
        ))}
      </select>
    </div>
  );
}
